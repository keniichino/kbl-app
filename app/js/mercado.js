// ====== Mercado ======
// Lo que NO hace: decir si algo va a subir. No hay pronósticos, no hay
// "probabilidad de que suba X%", no hay señales de compra. Nadie puede
// calibrar eso y una app que lo muestre con un número invita a creerle.
//
// Lo que SÍ hace: describir el estado con datos verificables (dónde está el
// precio respecto de su propio máximo y de su media, cuánto se mueve) y
// mostrar la estadística histórica condicional CON la muestra a la vista:
// "de las 47 veces que estuvo así, a 6 meses la mediana fue +8%". Eso es un
// hecho sobre el pasado, no una promesa sobre el futuro — y por eso siempre
// va con el n al lado, para que se vea cuándo la muestra es demasiado chica.
//
// Fuente: data912.com, gratis y sin API key. OJO: su propio autor la define
// como un hobby "purely for educational purposes" y avisa que los datos no son
// en tiempo real. Sirve para mirar el panorama, no para operar contra ella.

const BASE = 'https://data912.com';
const CACHE = 'kbl.mercado.cache';
const TTL_MIN = 30;

// CEDEARs de los dos índices, que es lo que se compra desde acá.
export const SEGUIDOS = [
  { ticker: 'SPY', nombre: 'S&P 500', detalle: 'las 500 más grandes de EE.UU.' },
  { ticker: 'QQQ', nombre: 'Nasdaq 100', detalle: 'las 100 tecnológicas más grandes' },
];

const leerCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) || {}; } catch { return {}; } };
const guardarCache = (d) => localStorage.setItem(CACHE, JSON.stringify({ ...d, ts: Date.now() }));

async function traer(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- Limpieza de la serie ----------
// La fuente NO ajusta por splits, y los CEDEARs cambian su ratio de conversión
// bastante seguido. Sin corregirlo, el panel muestra cualquier cosa: el CEDEAR
// de SPY hizo un split 1:3 el 29/05/2026 (de $56.000 a $18.760) y eso daba un
// "drawdown de -63,6%" y "-53% bajo su media de 200 días" para el S&P 500,
// que obviamente no pasó. El precio cambió, el valor no.
//
// También aparecen precios mal cargados de un solo día (el 03/08/2023 SPY
// figura a -41% y al día siguiente vuelve a su nivel): esos se interpolan en
// vez de tratarse como split, porque el salto se revierte.

const CASI = (x, obj, tol = 0.08) => Math.abs(x / obj - 1) < tol;
// Ratios de split habituales, para arriba y para abajo.
const RATIOS = [2, 3, 4, 5, 6, 8, 10, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10];

export function ajustarSerie(serie) {
  if (!Array.isArray(serie) || serie.length < 3) return { serie: serie || [], splits: [], outliers: [] };
  const s = serie.map((d) => ({ ...d }));
  const splits = [];
  const outliers = [];

  for (let i = 1; i < s.length; i++) {
    const salto = s[i].c / s[i - 1].c;
    if (Math.abs(salto - 1) < 0.25) continue;

    // ¿Se revierte al día siguiente? Entonces fue un precio mal cargado.
    const vuelve = s[i + 1] && Math.abs(s[i + 1].c / s[i - 1].c - 1) < 0.15;
    if (vuelve) {
      outliers.push({ date: s[i].date, era: s[i].c });
      const medio = (s[i - 1].c + s[i + 1].c) / 2;
      const k = medio / s[i].c;
      for (const campo of ['o', 'h', 'l', 'c']) if (s[i][campo]) s[i][campo] *= k;
      continue;
    }

    // Split: se reescala TODO lo anterior para que empalme con el precio nuevo.
    const ratio = RATIOS.find((r) => CASI(1 / salto, r)) ?? 1 / salto;
    splits.push({ date: s[i].date, ratio: +ratio.toFixed(2), de: s[i - 1].c, a: s[i].c });
    for (let k = 0; k < i; k++) {
      for (const campo of ['o', 'h', 'l', 'c']) if (s[k][campo]) s[k][campo] /= ratio;
    }
  }
  return { serie: s, splits, outliers };
}

// ---------- Métricas ----------

/** Media simple de los últimos n cierres. */
const media = (serie, n) => {
  const ult = serie.slice(-n);
  return ult.length ? ult.reduce((a, d) => a + d.c, 0) / ult.length : null;
};

/**
 * Volatilidad anualizada de los retornos diarios de los últimos n días.
 * Desvío estándar × √252 (los días hábiles de un año).
 */
function volatilidad(serie, n = 30) {
  const r = serie.slice(-n - 1).map((d, i, a) => (i ? Math.log(d.c / a[i - 1].c) : null)).filter((x) => x != null);
  if (r.length < 5) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const va = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(va) * Math.sqrt(252);
}

/** Caída desde el máximo de los últimos n días. Siempre ≤ 0. */
function drawdown(serie, n = 252) {
  const ult = serie.slice(-n);
  if (!ult.length) return null;
  const max = Math.max(...ult.map((d) => d.c));
  const hoy = ult.at(-1).c;
  return { pct: (hoy - max) / max, max, desde: ult.find((d) => d.c === max)?.date };
}

/**
 * Estadística condicional: de todos los días históricos en que el activo
 * estuvo en un drawdown PARECIDO al de hoy (±3 puntos), ¿qué pasó N días
 * después? Devuelve la mediana, los cuartiles y el n de la muestra.
 *
 * Esto es lo más cerca de una "probabilidad" que se puede decir con honestidad,
 * y aun así es sólo una descripción del pasado de ESTE activo en ESTA ventana
 * — que son ~3 años, o sea un puñado de regímenes de mercado, no una ley.
 */
function queSoliaPasar(serie, ddHoy, dias = 126) {
  if (ddHoy == null) return null;
  const casos = [];
  for (let i = 252; i < serie.length - dias; i++) {
    const ventana = serie.slice(i - 252, i + 1);
    const max = Math.max(...ventana.map((d) => d.c));
    const dd = (serie[i].c - max) / max;
    if (Math.abs(dd - ddHoy) > 0.03) continue;         // situación parecida
    casos.push((serie[i + dias].c - serie[i].c) / serie[i].c);
  }
  if (casos.length < 12) return { n: casos.length, pocos: true };
  casos.sort((a, b) => a - b);
  const q = (p) => casos[Math.floor(casos.length * p)];
  return {
    n: casos.length, pocos: false,
    mediana: q(0.5), p25: q(0.25), p75: q(0.75),
    positivos: casos.filter((x) => x > 0).length / casos.length,
    dias,
  };
}

// ---------- Carga ----------

/**
 * Estado de los activos seguidos. Cachea 30 minutos: la fuente no es de tiempo
 * real, así que pedirla en cada render sería gastar batería para nada.
 */
export async function estadoMercado({ forzar = false } = {}) {
  const cache = leerCache();
  if (!forzar && cache.ts && Date.now() - cache.ts < TTL_MIN * 60000 && cache.activos) {
    return { ...cache, deCache: true };
  }

  try {
    const [cedears, ...historicos] = await Promise.all([
      traer(`${BASE}/live/arg_cedears`),
      ...SEGUIDOS.map((s) => traer(`${BASE}/historical/cedears/${s.ticker}`).catch(() => null)),
    ]);

    const activos = SEGUIDOS.map((s, i) => {
      const vivo = (cedears || []).find((c) => c.symbol === s.ticker);
      const cruda = Array.isArray(historicos[i]) ? historicos[i] : [];
      if (!vivo && !cruda.length) return { ...s, sinDatos: true };
      // Sin este ajuste los números no significan nada (ver ajustarSerie).
      const { serie, splits, outliers } = ajustarSerie(cruda);

      const precio = vivo?.c ?? serie.at(-1)?.c ?? null;
      const dd = serie.length > 30 ? drawdown(serie) : null;
      const ma200 = media(serie, 200);
      return {
        ...s,
        precio,
        variacionDia: vivo?.pct_change ?? null,
        volumen: vivo?.v ?? null,
        drawdown: dd,
        ma200,
        vsMa200: ma200 && precio ? (precio - ma200) / ma200 : null,
        volatilidad: volatilidad(serie, 30),
        historico: queSoliaPasar(serie, dd?.pct, 126),
        dias: serie.length,
        desde: serie[0]?.date,
        splits, outliers,
      };
    });

    const datos = { activos, error: null };
    guardarCache(datos);
    return { ...datos, ts: Date.now(), deCache: false };
  } catch (e) {
    // Sin red: se muestra lo último que se pudo bajar, avisando que es viejo.
    if (cache.activos) return { ...cache, deCache: true, error: 'sin conexión' };
    return { activos: [], error: String(e.message || e) };
  }
}

// ---------- Render ----------

const fmtARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const pc = (x, dec = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dec).replace('.', ',')}%`);
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param libre  cuánto te queda disponible este mes, para traducir el precio
 *               del CEDEAR a algo tuyo. Sin esto es una cotización más.
 */
export function renderMercado(estado, { libre = null } = {}) {
  if (!estado || estado.error && !estado.activos?.length) {
    return `<div class="fin-card">
      <div class="fin-card-head"><h2>Mercado</h2></div>
      <div class="fin-vacio"><p>No pude traer los precios.</p>
      <p class="fin-vacio-sub">${esc(estado?.error || 'Probá de nuevo con internet.')}</p></div>
    </div>`;
  }

  const filas = estado.activos.filter((a) => !a.sinDatos).map((a) => {
    const h = a.historico;
    const enMaximo = a.drawdown && a.drawdown.pct > -0.01;
    const cuantos = libre && a.precio ? Math.floor(libre / a.precio) : null;

    return `
      <div class="mk-activo">
        <div class="mk-top">
          <div class="mk-id">
            <span class="mk-nombre">${esc(a.nombre)}</span>
            <span class="mk-ticker">${esc(a.ticker)} · ${esc(a.detalle)}</span>
          </div>
          <div class="mk-precio">
            ${fmtARS.format(a.precio)}
            <span class="mk-dia ${a.variacionDia >= 0 ? 'fin-ok' : 'fin-mal'}">${
              a.variacionDia != null ? pc(a.variacionDia / 100, 2) : ''}</span>
          </div>
        </div>

        <div class="mk-metricas">
          <div class="mk-metrica">
            <i>Desde su máximo</i>
            <b>${enMaximo ? 'está en máximo' : pc(a.drawdown?.pct)}</b>
          </div>
          <div class="mk-metrica">
            <i>vs. media 200 días</i>
            <b class="${a.vsMa200 >= 0 ? 'fin-ok' : 'fin-mal'}">${pc(a.vsMa200)}</b>
          </div>
          <div class="mk-metrica">
            <i>Volatilidad anual</i>
            <b>${a.volatilidad ? (a.volatilidad * 100).toFixed(0) + '%' : '—'}</b>
          </div>
        </div>

        ${h && !h.pocos ? `
          <div class="mk-hist">
            <div class="mk-hist-titulo">Cuando estuvo así, en los últimos ${Math.round(a.dias / 252)} años</div>
            <div class="mk-hist-barra">
              <span class="mk-hist-rango" style="left:0;right:0"></span>
              <span class="mk-hist-cero" style="left:${(Math.max(0, Math.min(1, (0 - h.p25) / (h.p75 - h.p25))) * 100).toFixed(0)}%"></span>
              <span class="mk-hist-mediana" style="left:${(Math.max(0, Math.min(1, (h.mediana - h.p25) / (h.p75 - h.p25))) * 100).toFixed(0)}%"></span>
            </div>
            <div class="mk-hist-nums">
              <span>${pc(h.p25)}</span>
              <b>mediana ${pc(h.mediana)}</b>
              <span>${pc(h.p75)}</span>
            </div>
            <div class="mk-hist-nota">
              A ${Math.round(h.dias / 21)} meses vista, en <b>${h.n}</b> situaciones parecidas.
              Subió en ${(h.positivos * 100).toFixed(0)} de cada 100.
              <b>Es lo que pasó, no lo que va a pasar.</b>
            </div>
          </div>`
        : `<div class="mk-hist-nota mk-hist-nota--pocos">
             Sin casos históricos parecidos suficientes${h ? ` (${h.n})` : ''} como para decir algo.
           </div>`}

        ${cuantos != null ? `
          <div class="mk-tuyo">Con los ${fmtARS.format(libre)} que te quedan libres este mes
            ${cuantos > 0 ? `entran <b>${cuantos}</b> ${cuantos === 1 ? 'CEDEAR' : 'CEDEARs'}` : 'no entra ninguno'}.</div>` : ''}

        ${a.splits?.length ? `
          <div class="mk-aviso">Serie corregida por ${a.splits.length === 1 ? 'un split' : `${a.splits.length} splits`}
            de ratio ${a.splits.map((s) => `1:${s.ratio}`).join(', ')}: la fuente no los ajusta y sin eso
            los porcentajes salían disparatados.</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="fin-card">
      <div class="fin-card-head">
        <h2>Mercado</h2>
        <button class="fin-link" data-accion="refrescar-mercado">Actualizar</button>
      </div>
      ${filas}
      <div class="fin-nota mk-pie">
        Precios de <b>data912.com</b>, gratis y sin cuenta — su autor la define como un proyecto
        educativo y avisa que <b>no son en tiempo real</b>. Sirve para mirar el panorama, no para operar.
        ${estado.deCache ? `Últimos datos ${esc(edadCache() || 'guardados')}.` : ''}
        <br>Acá no vas a encontrar señales de compra ni probabilidades de que algo suba:
        eso no se puede calcular, y un número inventado es peor que no tener nada.
      </div>
    </div>`;
}

export const edadCache = () => {
  const { ts } = leerCache();
  if (!ts) return null;
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
};
