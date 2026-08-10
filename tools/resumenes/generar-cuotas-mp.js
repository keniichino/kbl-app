// Genera el SQL de las cuotas de Mercado Pago según el ÚLTIMO resumen.
//
// Por qué desde el último y no acumulando todos: el resumen más reciente ya
// dice en qué cuota va cada compra ("2 de 3"), que es exactamente el estado
// que la app necesita en `cuota_actual`. Reconstruirlo sumando resúmenes viejos
// sería más frágil y daría lo mismo.
//
// `fecha_primer_venc` es el vencimiento de la cuota ACTUAL (no la primera de
// la serie): así lo interpreta calendarioCuotas() en fincore.js.

const fs = require('fs');
const path = require('path');
const consumos = require('./consumos-mp.json');

const esc = (s) => String(s).replace(/'/g, "''");
const fmt = (n) => '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);

// El resumen más nuevo manda.
const ultimo = [...new Set(consumos.map((c) => c.periodo))].sort().at(-1);
const cuotas = consumos.filter((c) => c.periodo === ultimo && c.cuota);
const venc = cuotas[0]?.vencimiento;

const sql = [`-- ============================================================
-- Cuotas de Mercado Pago según el resumen de ${ultimo} (vence ${venc}).
--
-- Son CINCO compras distintas con plazos distintos, no una sola cuota de
-- $383.889: dos terminan este mes y las otras tres siguen hasta enero 2027.
-- Cargarlas como una sola hacía que la proyección de deuda mostrara el mismo
-- importe todos los meses en vez de escalonarse.
--
-- Saldo total pendiente desde ${ultimo}: ${fmt(cuotas.reduce((a, c) => a + (c.cuotaTotal - c.cuotaN + 1) * c.monto, 0))}
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP), no en el de la empresa.
--
-- Idempotente: matchea por descripción + monto, así que si ya tenías la cuota
-- cargada le corrige el número y el vencimiento en vez de duplicarla.
-- ============================================================

begin;
`];

for (const c of cuotas) {
  const restan = c.cuotaTotal - c.cuotaN + 1;
  const desc = c.comercio;
  sql.push(`-- ${desc}: cuota ${c.cuotaN} de ${c.cuotaTotal}, quedan ${restan} (${fmt(restan * c.monto)})${restan === 1 ? ' — ES LA ÚLTIMA' : ''}
insert into public.cuotas (id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
select gen_random_uuid(), '${esc(desc)}', 'mp', ${c.monto}, ${c.cuotaN}, ${c.cuotaTotal}, '${venc}', 'activa', '${c.moneda}', '${c.fecha}'
 where not exists (
   select 1 from public.cuotas
    where user_id = auth.uid() and tarjeta = 'mp'
      and round(monto_cuota::numeric, 2) = ${c.monto}
      and cuota_total = ${c.cuotaTotal}
 );

update public.cuotas
   set cuota_actual = ${c.cuotaN}, fecha_primer_venc = '${venc}',
       monto_cuota = ${c.monto}, estado = 'activa', descripcion = '${esc(desc)}'
 where user_id = auth.uid() and tarjeta = 'mp'
   and round(monto_cuota::numeric, 2) = ${c.monto}
   and cuota_total = ${c.cuotaTotal};
`);
}

sql.push(`commit;

-- Verificación: el total de este mes tiene que dar ${fmt(cuotas.reduce((a, c) => a + c.monto, 0))}.
select descripcion, cuota_actual || '/' || cuota_total as cuota, monto_cuota,
       fecha_primer_venc, (cuota_total - cuota_actual + 1) as restantes,
       (cuota_total - cuota_actual + 1) * monto_cuota as pendiente
  from public.cuotas
 where user_id = auth.uid() and tarjeta = 'mp' and estado = 'activa'
 order by fecha_primer_venc, descripcion;`);

const dest = path.join(__dirname, '..', '..', 'supabase', `cuotas-mp-${ultimo}.sql`);
fs.writeFileSync(dest, sql.join('\n'));

console.log(`Resumen usado: ${ultimo} (vence ${venc})`);
console.log(`${cuotas.length} cuotas · este mes ${fmt(cuotas.reduce((a, c) => a + c.monto, 0))} · pendiente ${
  fmt(cuotas.reduce((a, c) => a + (c.cuotaTotal - c.cuotaN + 1) * c.monto, 0))}`);
console.log(`\nSQL: ${path.resolve(dest)}`);

// Proyección: cómo se escalona la deuda de MP mes a mes.
const proy = {};
for (const c of cuotas) {
  const [y, m] = venc.split('-').map(Number);
  for (let i = 0; i < c.cuotaTotal - c.cuotaN + 1; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    proy[k] = (proy[k] || 0) + c.monto;
  }
}
console.log('\n=== CÓMO SE ESCALONA (sólo MP) ===');
for (const k of Object.keys(proy).sort()) {
  const barra = '█'.repeat(Math.round(proy[k] / 15000));
  console.log(`${k}  ${fmt(proy[k]).padStart(13)}  ${barra}`);
}
