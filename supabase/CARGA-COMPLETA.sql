-- ============================================================
-- CARGA COMPLETA — reemplaza a los scripts anteriores
--
-- POR QUÉ HAY QUE CORRER ESTE Y NO LOS DE ANTES:
-- los anteriores usaban auth.uid() para el user_id y para los guards
-- anti-duplicados. En el SQL Editor eso vale NULL (las consultas corren como
-- el rol postgres, no como tu usuario), así que:
--   · las filas entraron sin dueño y la app no las ve;
--   · el guard nunca detectaba lo ya insertado, y cada corrida duplicaba todo
--     (por eso quedaron 644 gastos = 322 x 2).
--
-- Este resuelve el user_id UNA vez desde auth.users y lo usa en todos lados.
-- Empieza limpiando lo que quedó huérfano, así que se puede correr tantas
-- veces como haga falta sin duplicar nada.
--
-- CORRER EN EL PROYECTO PERSONAL (KBL APP).
-- ============================================================

do $$
declare
  mi_id uuid;
  n int;
begin
  select id into mi_id from auth.users order by last_sign_in_at desc nulls last limit 1;
  if mi_id is null then
    raise exception 'No hay usuarios en auth.users';
  end if;
  raise notice 'Usando user_id = %', mi_id;

  ---------------------------------------------------------------
  -- 1. Limpieza de lo que quedó sin dueño en las corridas fallidas
  ---------------------------------------------------------------
  delete from public.gastos where user_id is null;
  get diagnostics n = row_count; raise notice 'gastos huerfanos borrados: %', n;

  delete from public.cuotas where user_id is null;
  get diagnostics n = row_count; raise notice 'cuotas huerfanas borradas: %', n;

  delete from public.recurrentes where user_id is null;
  get diagnostics n = row_count; raise notice 'recurrentes huerfanos borrados: %', n;

  ---------------------------------------------------------------
  -- 2. Gastos (322 consumos, 2026-03-05 a 2026-08-05)
  ---------------------------------------------------------------
  create temp table if not exists _imp_gastos (
    fecha date, monto numeric, descripcion text, categoria text, tarjeta text, moneda text
  ) on commit drop;
  delete from _imp_gastos;

  insert into _imp_gastos (fecha, monto, descripcion, categoria, tarjeta, moneda) values
    ('2026-03-05', 4477.2, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-03-06', 115512.18, 'MERPAGO*ERIC', 'otros', 'mac', 'ARS'),
    ('2026-03-06', 21950, 'STARBUCKS TRIUNVIRATO', 'comida', 'visa', 'ARS'),
    ('2026-03-07', 28990, 'MERPAGO*MERCADOLIBRE', 'servicios', 'mac', 'ARS'),
    ('2026-03-07', 11368, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-03-08', 17066.28, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-03-09', 5500, 'JUAN VALDEZ CAFE V URQ', 'comida', 'mac', 'ARS'),
    ('2026-03-10', 2290, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-03-10', 10400, 'DEAN DENNYS BELGRANO', 'otros', 'mac', 'ARS'),
    ('2026-03-10', 2580, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-03-11', 2294, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-03-12', 20800, 'WWW.TICKETEK.COM.AR', 'salidas', 'mac', 'ARS'),
    ('2026-03-13', 29056, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-03-13', 42475, 'FARMPLUS S 30 V. URQUIZA', 'otros', 'visa', 'ARS'),
    ('2026-03-13', 21700, 'STARBUCKS COFFEE', 'comida', 'visa', 'ARS'),
    ('2026-03-19', 69.52, 'ZARA FLORIANOPOLIS BRL 358,00', 'otros', 'visa', 'ARS'),
    ('2026-03-19', 76.79, 'RIACHUELO FILIAL 053 USD 76,79', 'otros', 'visa', 'USD'),
    ('2026-03-20', 1240, 'PROPINA*RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-03-20', 23526, 'RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-03-24', 59924.98, 'DUTY FREE SHOP DOLARES', 'otros', 'visa', 'ARS'),
    ('2026-03-24', 43672.25, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-03-25', 1.43, 'GOOGLE *YouTube', 'servicios', 'mac', 'USD'),
    ('2026-03-25', 3398, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-03-25', 2220, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-03-25', 22241.24, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-03-25', 14000, 'ANTIGUA BELGRANO', 'otros', 'visa', 'ARS'),
    ('2026-03-31', 2920, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-03-31', 3160, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-04-01', 8648, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-04-01', 7875, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-04-03', 18800, 'MERPAGO*KSKAGRO', 'super', 'mac', 'ARS'),
    ('2026-04-03', 2480, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-04-03', 2660, 'DLO*DIDI', 'transporte', 'mac', 'ARS'),
    ('2026-04-04', 17835, 'MARKET OLAZABAL', 'super', 'mac', 'ARS'),
    ('2026-04-07', 6059, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-04-07', 2000, 'MERPAGO*VERA801', 'salidas', 'visa', 'ARS'),
    ('2026-04-07', 3200, 'EXPRESS SUCRE 2490', 'super', 'visa', 'ARS'),
    ('2026-04-08', 3510, 'DLO*DiDi', 'transporte', 'mac', 'ARS'),
    ('2026-04-08', 4190, 'PAYU*AR*UBER', 'transporte', 'mac', 'ARS'),
    ('2026-04-08', 9400, 'PANADERIA LAS DELICIAS', 'comida', 'mac', 'ARS'),
    ('2026-04-08', 5400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-04-11', 70906.65, 'Market Martinez (Italia)', 'super', 'visa', 'ARS'),
    ('2026-04-13', 12999, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-04-14', 2062.5, 'DLOCAL*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-04-14', 5900, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-04-15', 23690, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-15', 8988, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-04-16', 6170, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-04-16', 5970, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-04-18', 12890, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-18', 21.64, 'WL *Steam Purchase USD 21,64', 'servicios', 'visa', 'USD'),
    ('2026-04-19', 4500, 'MERPAGO*VERA801', 'salidas', 'visa', 'ARS'),
    ('2026-04-20', 20244, 'MERPAGO*CARCASA', 'otros', 'visa', 'ARS'),
    ('2026-04-21', 3010, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-04-22', 24478.86, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-22', 1747.5, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-04-24', 41918.27, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-25', 1.43, 'GOOGLE *YouTube', 'servicios', 'mac', 'USD'),
    ('2026-04-26', 10175, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-26', 10377, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-04-27', 16277.5, 'Market Martinez (Italia)', 'super', 'visa', 'ARS'),
    ('2026-04-27', 19309, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-27', 8775, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-04-27', 2.88, 'WL *STEAM PURCHASE USD 2,88', 'servicios', 'visa', 'USD'),
    ('2026-04-28', 18118, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-28', 3090, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-04-28', 2660, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-04-28', 3900, 'DEAN DENNYS BELGRANO', 'otros', 'visa', 'ARS'),
    ('2026-04-29', 3200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-04-29', 15109, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-04-30', 3200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-04-30', 10600, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-04-30', 88000, 'ALTERNATIVATEATRAL.COM', 'otros', 'visa', 'ARS'),
    ('2026-04-30', 47780, 'RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-05-01', 540, 'PROPINA*RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-05-01', 10569, 'RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-05-02', 36867.17, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-05-02', 27000, 'EL SOL DE MARTINEZ', 'otros', 'visa', 'ARS'),
    ('2026-05-03', 5880, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-05', 3732, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-05-05', 2990, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-06', 14334, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-05-07', 31499, 'MERPAGO*LATRIESTINA', 'otros', 'mac', 'ARS'),
    ('2026-05-07', 2625.65, 'EXPRESS BAUNES 2692', 'super', 'visa', 'ARS'),
    ('2026-05-08', 6700, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-09', 35996, 'MERPAGO*CROCS', 'otros', 'visa', 'ARS'),
    ('2026-05-09', 19500, 'SOMOS GEEK', 'otros', 'visa', 'ARS'),
    ('2026-05-10', 2.99, 'APPLE.COM BILL', 'servicios', 'mac', 'USD'),
    ('2026-05-11', 3000, 'MERPAGO*VERA801', 'salidas', 'visa', 'ARS'),
    ('2026-05-11', 3140, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-12', 1900, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-12', 22118, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-05-12', 3250, 'DLOCAL*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-05-12', 1995, 'CARREFOUR EXPRESS-ESTEBAN', 'super', 'visa', 'ARS'),
    ('2026-05-12', 13600, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-05-13', 8345.22, 'MERPAGO*CHEMOPANSA', 'otros', 'visa', 'ARS'),
    ('2026-05-13', 2300, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-13', 2880, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-13', 2860, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-05-13', 7.29, 'WL *STEAM PURCHASE USD 7,29', 'servicios', 'visa', 'USD'),
    ('2026-05-14', 7400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-14', 39586.3, 'MERPAGO*SEBASTIANMARCELOG', 'otros', 'visa', 'ARS'),
    ('2026-05-15', 3200, 'MERPAGO*YPF', 'transporte', 'visa', 'ARS'),
    ('2026-05-15', 4800, 'MERPAGO*PARKINGDOT', 'otros', 'visa', 'ARS'),
    ('2026-05-15', 70000, 'RONDA-IRONDRIVER', 'otros', 'visa', 'ARS'),
    ('2026-05-15', 39099, 'MC DONALDS (PHI)', 'comida', 'visa', 'ARS'),
    ('2026-05-15', 15320, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-05-15', 112030.01, 'YPF PEAJE', 'transporte', 'visa', 'ARS'),
    ('2026-05-15', 10280, 'YPF FULL 2063', 'transporte', 'visa', 'ARS'),
    ('2026-05-16', 71989, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-05-17', 5700, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-17', 43000, 'MC DONALDS TRIUNVIRATO', 'comida', 'visa', 'ARS'),
    ('2026-05-17', 2.19, 'WL *STEAM PURCHASE USD 2,19', 'servicios', 'visa', 'USD'),
    ('2026-05-18', 6700, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-18', 7840, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-05-19', 5300, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-19', 2892, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-05-19', 2750, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-19', 11200, 'CARDOZO VALENTIN', 'otros', 'visa', 'ARS'),
    ('2026-05-20', 1900, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-20', 2300, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-20', 28245.36, 'MERPAGO*CHEMOPANSA', 'otros', 'visa', 'ARS'),
    ('2026-05-20', 15309, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-05-20', 2650, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-20', 4755, 'PAGSMILE *DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-05-21', 21322.1, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-05-21', 9500, 'SIPAGO *SILVA ROBERTO OMA', 'otros', 'visa', 'ARS'),
    ('2026-05-22', 6700, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-22', 2290, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-05-23', 36000, 'MERPAGO*UMOCLUB', 'otros', 'mac', 'ARS'),
    ('2026-05-23', 54296.53, 'MERPAGO*RECORRIDOSA', 'otros', 'mac', 'ARS'),
    ('2026-05-23', 37200, 'MERPAGO*SKALMARKET', 'otros', 'visa', 'ARS'),
    ('2026-05-23', 36000, 'MERPAGO*UMOCLUB', 'otros', 'visa', 'ARS'),
    ('2026-05-24', 42368.04, 'MERPAGO*MATIASMARTINCELES', 'otros', 'visa', 'ARS'),
    ('2026-05-24', 32000, 'MERPAGO*LUCIOFIGUERED', 'otros', 'visa', 'ARS'),
    ('2026-05-25', 10300, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-25', 8200, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-25', 16800, 'EL SOL DE MARTINEZ', 'otros', 'visa', 'ARS'),
    ('2026-05-25', 4500, 'GASTROBUS S A', 'otros', 'visa', 'ARS'),
    ('2026-05-26', 7400, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-26', 2735, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-05-26', 4700, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-05-27', 3000, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-27', 2500, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-27', 9500, 'SIPAGO *SILVA ROBERTO OMA', 'otros', 'visa', 'ARS'),
    ('2026-05-27', 2960, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-27', 2460, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-05-27', 5000, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-05-28', 4200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-28', 7400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-29', 20, 'CLAUDE.AI SUBSCR', 'servicios', 'mac', 'USD'),
    ('2026-05-29', 7000, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-29', 1900, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-29', 3000, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-29', 1600, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-05-29', 2110, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-05-29', 3170, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-05-29', 5000, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-05-30', 4279.6, 'MERPAGO*GONZALOJAVIERSOSA', 'otros', 'visa', 'ARS'),
    ('2026-05-30', 26747.5, 'MERPAGO*BRIANCARLOSARIELL', 'otros', 'visa', 'ARS'),
    ('2026-05-30', 31400.37, 'MERPAGO*COTO', 'super', 'visa', 'ARS'),
    ('2026-05-30', 3200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-30', 4200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-30', 22200, 'MERPAGO*CREMOLATTI', 'otros', 'visa', 'ARS'),
    ('2026-05-30', 9500, 'VETERINARIA JULIETA', 'otros', 'visa', 'ARS'),
    ('2026-05-30', 13700, 'VETERINARIA JULIETA', 'otros', 'visa', 'ARS'),
    ('2026-05-30', 20990, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-05-31', 14600, 'MERPAGO*SHOUJIN', 'otros', 'visa', 'ARS'),
    ('2026-05-31', 36481.56, 'MERPAGO*COTO', 'super', 'visa', 'ARS'),
    ('2026-05-31', 4200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-31', 7400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-05-31', 35336.68, 'ZARA', 'otros', 'visa', 'ARS'),
    ('2026-05-31', 20622.04, 'CABIFY AR 262220Y7FARN', 'transporte', 'visa', 'ARS'),
    ('2026-05-31', 6884, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-05-31', 20.61, 'F LinkedIn*P302562 LinkedIn*USD 20,61', 'otros', 'visa', 'USD'),
    ('2026-05-31', 35336.66, 'ZARA', 'otros', 'visa', 'ARS'),
    ('2026-06-01', 7400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-01', 5, 'ANTHROPIC in1TdY1MBUSD 5,00', 'servicios', 'visa', 'ARS'),
    ('2026-06-02', 7500, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-06-02', 27412, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-02', 2896, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-06-02', 2985, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-06-02', 5000, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-06-03', 4200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-03', 3800, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-06-03', 4600, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-06-03', 5770.67, 'CABIFY2623YWDXXGTN', 'transporte', 'visa', 'ARS'),
    ('2026-06-03', 2004.5, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-06-03', 2964, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-06-03', 5000, 'PANADERIA LAS DELICIAS', 'comida', 'visa', 'ARS'),
    ('2026-06-04', 36297.84, 'MERPAGO*COTO', 'super', 'visa', 'ARS'),
    ('2026-06-04', 13890, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-06', 20658, 'MERPAGO*CARREFOUR', 'super', 'visa', 'ARS'),
    ('2026-06-06', 4500, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-06', 9250, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-06', 16537.38, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-06-07', 116214.72, 'MARKET OLAZABAL', 'super', 'mac', 'ARS'),
    ('2026-06-08', 5800, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-08', 2500, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-08', 14844, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-06-08', 3760, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-06-09', 24, 'NOTION LABS, INC', 'otros', 'mac', 'USD'),
    ('2026-06-09', 3300, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-09', 19364, 'MERPAGO*MERCADOLIBRE', 'servicios', 'mp', 'ARS'),
    ('2026-06-10', 3300, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-11', 22799, 'MERPAGO*PLANETAZENOK', 'otros', 'mp', 'ARS'),
    ('2026-06-12', 9200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-12', 35744.15, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-13', 6500, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-13', 4300, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-13', 17467.5, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-14', 5.8, '2026 IA', 'otros', 'mac', 'USD'),
    ('2026-06-14', 22900, 'MERPAGO*PORTANEGRACAF', 'comida', 'visa', 'ARS'),
    ('2026-06-14', 5300, 'MERPAGO*KIOSCOM24', 'otros', 'visa', 'ARS'),
    ('2026-06-14', 19700, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-14', 27440.4, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-14', 63700, 'FUDO *ENS', 'otros', 'visa', 'ARS'),
    ('2026-06-14', 5, 'WL *STEAM PURCHASE USD 5,00', 'servicios', 'visa', 'USD'),
    ('2026-06-15', 7600, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-16', 2400, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-06-16', 6700, 'MERPAGO*PORTANEGRACAF', 'comida', 'visa', 'ARS'),
    ('2026-06-16', 8100, 'LA AMERICANA CALLAO', 'otros', 'visa', 'ARS'),
    ('2026-06-16', 2100, 'PVS*SUPER ESTRELLA AV.OLA', 'otros', 'visa', 'ARS'),
    ('2026-06-17', 22110, 'MERPAGO*OGGIZAPATOS', 'comida', 'visa', 'ARS'),
    ('2026-06-17', 7600, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-17', 96000, 'LA OPERA', 'otros', 'visa', 'ARS'),
    ('2026-06-18', 5000, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-18', 4300, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-06-18', 7200, 'OSCAR ALBERTO CORONEL', 'otros', 'visa', 'ARS'),
    ('2026-06-18', 2660, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-06-19', 5000, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-19', 31900.31, 'MERPAGO*COTO', 'super', 'visa', 'ARS'),
    ('2026-06-19', 2500, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-20', 35000, 'MANISAN SRL', 'otros', 'visa', 'ARS'),
    ('2026-06-20', 32700, 'JUAN VALDEZ CAFE V URQ', 'comida', 'visa', 'ARS'),
    ('2026-06-20', 12605.82, 'CABIFY2625ARTOSY7E', 'transporte', 'visa', 'ARS'),
    ('2026-06-21', 26400, 'MERPAGO*PORTANEGRACAF', 'comida', 'visa', 'ARS'),
    ('2026-06-21', 3300, 'MERPAGO*PORTANEGRACAF', 'comida', 'visa', 'ARS'),
    ('2026-06-22', 4300, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-22', 21441, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-06-22', 3460, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-06-22', 450, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-06-22', 24100, 'SGARAMELLO RUBEN DANIEL', 'otros', 'visa', 'ARS'),
    ('2026-06-22', 2900, 'SGARAMELLO RUBEN DANIEL', 'otros', 'visa', 'ARS'),
    ('2026-06-22', 5010, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-06-22', 159698.07, 'FARMPLUS S 30 V. URQUIZA', 'otros', 'visa', 'ARS'),
    ('2026-06-23', 54012.21, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-24', 2500, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-24', 28453.1, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-06-25', 26873, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-26', 2500, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-26', 14734.5, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-06-26', 90180.18, 'FARMPLUS S 30 V. URQUIZA', 'otros', 'visa', 'ARS'),
    ('2026-06-27', 12800, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-27', 9000, 'SATANA PIZZA', 'comida', 'visa', 'ARS'),
    ('2026-06-28', 20055, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-06-28', 8344, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-06-29', 20, 'ANTHROPIC* CLAUD', 'servicios', 'mac', 'USD'),
    ('2026-06-29', 4300, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-06-29', 28998.5, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-07-01', 28217.49, 'FARMPLUS S 30 V. URQUIZA', 'otros', 'visa', 'ARS'),
    ('2026-07-02', 3.49, 'WL *STEAM PURCHASE USD 3,49', 'servicios', 'visa', 'USD'),
    ('2026-07-03', 16998.43, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-04', 6400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-07-04', 16.49, 'WL *STEAM PURCHASE USD 16,49', 'servicios', 'visa', 'USD'),
    ('2026-07-05', 53600, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-07-06', 2400, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-07-06', 2100, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-07-06', 4400, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-07-06', 3690, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-07-06', 5000, 'OSCAR ALBERTO CORONEL', 'otros', 'visa', 'ARS'),
    ('2026-07-06', 2100, 'OSCAR ALBERTO CORONEL', 'otros', 'visa', 'ARS'),
    ('2026-07-08', 36559.57, 'Market Martinez (Edison)', 'super', 'visa', 'ARS'),
    ('2026-07-08', 21300, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-07-09', 39400, 'MC DONALDS TRIUNVIRATO', 'comida', 'visa', 'ARS'),
    ('2026-07-10', 105793.06, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-10', 165750, 'HOYTS', 'salidas', 'visa', 'ARS'),
    ('2026-07-10', 2.52, 'WL *Steam Purchase USD 2,52', 'servicios', 'visa', 'USD'),
    ('2026-07-11', 26200, 'MERPAGO*PORTANEGRACAF', 'comida', 'visa', 'ARS'),
    ('2026-07-11', 56728.78, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-14', 16201.99, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-16', 4400, 'MERPAGO*OPEN25', 'salidas', 'visa', 'ARS'),
    ('2026-07-16', 63900, 'MERPAGO*MOOI', 'salidas', 'visa', 'ARS'),
    ('2026-07-16', 4000, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-07-16', 2600, 'DLO*DIDI', 'transporte', 'visa', 'ARS'),
    ('2026-07-17', 5300, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-07-18', 46291.89, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-18', 2.18, 'WL *STEAM PURCHASE USD 2,18', 'servicios', 'visa', 'USD'),
    ('2026-07-19', 31701.95, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-20', 20, 'ANTHROPIC* CLAUD in1TvJw0BUSD 20,00', 'servicios', 'visa', 'ARS'),
    ('2026-07-21', 24451.24, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-07-22', 10000, 'SBUX CABILDO', 'otros', 'visa', 'ARS'),
    ('2026-07-22', 6094, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-07-22', 2535, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-07-22', 41200, 'GREEN EAT', 'otros', 'visa', 'ARS'),
    ('2026-07-24', 9600, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-07-24', 59500, 'SIPAGO *PLANETA PIZZA', 'comida', 'visa', 'ARS'),
    ('2026-07-25', 3200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-07-25', 4600, 'MERPAGO*365', 'otros', 'visa', 'ARS'),
    ('2026-07-25', 5900, 'DLO*DiDi', 'transporte', 'visa', 'ARS'),
    ('2026-07-25', 1000, 'PROPINA*RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-07-25', 11350, 'RAPPI', 'comida', 'visa', 'ARS'),
    ('2026-07-26', 9400, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-07-26', 1681.38, 'MERPAGO*FARMAPLUS', 'otros', 'visa', 'ARS'),
    ('2026-07-26', 73879.25, 'MERPAGO*CARREFOUR', 'super', 'visa', 'ARS'),
    ('2026-07-26', 7890.84, 'Express Olazabal 5179', 'super', 'visa', 'ARS'),
    ('2026-07-26', 5306, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-07-28', 14700, 'MERPAGO*365', 'otros', 'visa', 'ARS'),
    ('2026-07-29', 30313.09, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-08-01', 27200, 'PEN SHOP-PEN SHOP', 'otros', 'visa', 'ARS'),
    ('2026-08-02', 44000, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-08-02', 61945.85, 'Market Olazabal', 'super', 'visa', 'ARS'),
    ('2026-08-02', 7034, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-08-02', 0.44, 'WL *STEAM PURCHASE USD 0,44', 'servicios', 'visa', 'USD'),
    ('2026-08-03', 45000, 'LA JUVENIL', 'otros', 'visa', 'ARS'),
    ('2026-08-03', 3397, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-08-03', 3566, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-08-04', 35200, 'MERPAGO*KSKAGRO', 'super', 'visa', 'ARS'),
    ('2026-08-04', 21143.85, 'Market Martinez (Edison)', 'super', 'visa', 'ARS'),
    ('2026-08-04', 9225, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-08-04', 9155, 'PAYU*AR*UBER', 'transporte', 'visa', 'ARS'),
    ('2026-08-05', 39998, 'MERPAGO*ANTIGUACASACE', 'otros', 'visa', 'ARS');

  insert into public.gastos (id, user_id, monto, descripcion, categoria, tarjeta, moneda, fecha, created_at)
  select gen_random_uuid(), mi_id, i.monto, i.descripcion, i.categoria, i.tarjeta, i.moneda, i.fecha, i.fecha::timestamptz
    from _imp_gastos i
   where not exists (
     select 1 from public.gastos g
      where g.user_id = mi_id and g.fecha = i.fecha
        and round(g.monto::numeric, 2) = round(i.monto::numeric, 2)
        and coalesce(g.descripcion, '') = i.descripcion
   );
  get diagnostics n = row_count; raise notice 'gastos insertados: %', n;

  ---------------------------------------------------------------
  -- 3. Suscripciones, fijos e ingreso con su historial
  ---------------------------------------------------------------

  -- Adobe
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Adobe')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":9381.13,"2026-04":9381.13,"2026-05":9381.13,"2026-06":9381.13,"2026-07":9381.13}'::jsonb,
           monto = 9381.13, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 22), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'adobe'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Adobe');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Adobe', '', 9381.13, 'ARS', 22, 'mac', 'activo',
            'adobe', '{"2026-03":9381.13,"2026-04":9381.13,"2026-05":9381.13,"2026-06":9381.13,"2026-07":9381.13}'::jsonb, '2026-03-01', now());
  end if;

  -- Spotify
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Spotify')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":5098,"2026-04":5098,"2026-05":5098,"2026-06":5098,"2026-07":5098}'::jsonb,
           monto = 5098, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 19), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'spotify'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Spotify');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Spotify', '', 5098, 'ARS', 19, 'mac', 'activo',
            'spotify', '{"2026-03":5098,"2026-04":5098,"2026-05":5098,"2026-06":5098,"2026-07":5098}'::jsonb, '2026-03-01', now());
  end if;

  -- Netflix
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Netflix')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":19999,"2026-04":19999,"2026-05":19999,"2026-06":19999,"2026-07":19999}'::jsonb,
           monto = 19999, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 29), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'dlocal*netflix com'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Netflix');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Netflix', '', 19999, 'ARS', 29, 'mac', 'activo',
            'dlocal*netflix com', '{"2026-03":19999,"2026-04":19999,"2026-05":19999,"2026-06":19999,"2026-07":19999}'::jsonb, '2026-03-01', now());
  end if;

  -- YouTube Premium
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('YouTube Premium')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":3399,"2026-04":3399,"2026-05":3399,"2026-06":3399,"2026-07":4499}'::jsonb,
           monto = 4499, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 26), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'youtubep'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('YouTube Premium');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'YouTube Premium', '', 4499, 'ARS', 26, 'mac', 'activo',
            'youtubep', '{"2026-03":3399,"2026-04":3399,"2026-05":3399,"2026-06":3399,"2026-07":4499}'::jsonb, '2026-03-01', now());
  end if;

  -- Microsoft 365
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Microsoft 365')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":683,"2026-04":683,"2026-05":683,"2026-06":683,"2026-07":683}'::jsonb,
           monto = 683, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 11), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'microsoft*subscr'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Microsoft 365');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Microsoft 365', '', 683, 'ARS', 11, 'mac', 'activo',
            'microsoft*subscr', '{"2026-03":683,"2026-04":683,"2026-05":683,"2026-06":683,"2026-07":683}'::jsonb, '2026-03-01', now());
  end if;

  -- Xbox Game Pass
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Xbox Game Pass')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-04":11999,"2026-05":11999}'::jsonb,
           monto = 11999, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 3), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'microsoft*xbox g'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Xbox Game Pass');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Xbox Game Pass', '', 11999, 'ARS', 3, 'mac', 'activo',
            'microsoft*xbox g', '{"2026-04":11999,"2026-05":11999}'::jsonb, '2026-04-01', now());
  end if;

  -- Mercado Libre
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Mercado Libre')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":3490,"2026-04":3490,"2026-05":3490,"2026-06":3490,"2026-07":3490}'::jsonb,
           monto = 3490, moneda = 'ARS', tipo = 'suscripcion',
           dia = coalesce(dia, 23), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'meli'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Mercado Libre');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Mercado Libre', '', 3490, 'ARS', 23, 'mac', 'activo',
            'meli', '{"2026-03":3490,"2026-04":3490,"2026-05":3490,"2026-06":3490,"2026-07":3490}'::jsonb, '2026-03-01', now());
  end if;

  -- CapCut
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('CapCut')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":13.99,"2026-04":13.99,"2026-05":13.99,"2026-06":13.99}'::jsonb,
           monto = 13.99, moneda = 'USD', tipo = 'suscripcion',
           dia = coalesce(dia, 14), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'capcut'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('CapCut');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'CapCut', '', 13.99, 'USD', 14, 'mac', 'activo',
            'capcut', '{"2026-03":13.99,"2026-04":13.99,"2026-05":13.99,"2026-06":13.99}'::jsonb, '2026-03-01', now());
  end if;

  -- Google One
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Google One')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":1.99,"2026-04":1.99,"2026-05":1.99,"2026-06":1.99,"2026-07":1.99}'::jsonb,
           monto = 1.99, moneda = 'USD', tipo = 'suscripcion',
           dia = coalesce(dia, 26), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'google o'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Google One');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Google One', '', 1.99, 'USD', 26, 'mac', 'activo',
            'google o', '{"2026-03":1.99,"2026-04":1.99,"2026-05":1.99,"2026-06":1.99,"2026-07":1.99}'::jsonb, '2026-03-01', now());
  end if;

  -- Apple
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Apple')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":2.99,"2026-04":2.99,"2026-06":4.18,"2026-07":5.37}'::jsonb,
           monto = 5.37, moneda = 'USD', tipo = 'suscripcion',
           dia = coalesce(dia, 13), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'apple.com/bill'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Apple');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Apple', '', 5.37, 'USD', 13, 'mac', 'activo',
            'apple.com/bill', '{"2026-03":2.99,"2026-04":2.99,"2026-06":4.18,"2026-07":5.37}'::jsonb, '2026-03-01', now());
  end if;

  -- Steam
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Steam')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-04":5,"2026-05":5,"2026-06":55.35,"2026-07":5}'::jsonb,
           monto = 5, moneda = 'USD', tipo = 'suscripcion',
           dia = coalesce(dia, 10), medio = coalesce(nullif(medio, ''), 'visa'),
           coincide = coalesce(nullif(coincide, ''), 'steamgames.com 425952298'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Steam');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'suscripcion', 'Steam', '', 5, 'USD', 10, 'visa', 'activo',
            'steamgames.com 425952298', '{"2026-04":5,"2026-05":5,"2026-06":55.35,"2026-07":5}'::jsonb, '2026-04-01', now());
  end if;

  -- Personal Flow
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Personal Flow')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-03":31766.41,"2026-04":32871.61,"2026-05":34020.01,"2026-06":45966.01,"2026-07":46882.51}'::jsonb,
           monto = 46882.51, moneda = 'ARS', tipo = 'fijo',
           dia = coalesce(dia, 14), medio = coalesce(nullif(medio, ''), 'mac'),
           coincide = coalesce(nullif(coincide, ''), 'persflow51310002'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Personal Flow');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'fijo', 'Personal Flow', '', 46882.51, 'ARS', 14, 'mac', 'activo',
            'persflow51310002', '{"2026-03":31766.41,"2026-04":32871.61,"2026-05":34020.01,"2026-06":45966.01,"2026-07":46882.51}'::jsonb, '2026-03-01', now());
  end if;

  -- Facultad (UADE)
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Facultad (UADE)')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2026-07":272000}'::jsonb,
           monto = 272000, moneda = 'ARS', tipo = 'fijo',
           dia = coalesce(dia, 13), medio = coalesce(nullif(medio, ''), 'visa'),
           coincide = coalesce(nullif(coincide, ''), 'www.uade.edu.ar'), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Facultad (UADE)');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'fijo', 'Facultad (UADE)', '', 272000, 'ARS', 13, 'visa', 'activo',
            'www.uade.edu.ar', '{"2026-07":272000}'::jsonb, '2026-07-01', now());
  end if;

  -- Sueldo
  if exists (select 1 from public.recurrentes where user_id = mi_id and lower(nombre) = lower('Sueldo')) then
    update public.recurrentes
       set historial = coalesce(historial, '{}'::jsonb) || '{"2025-08":1783126,"2026-06":2156747}'::jsonb,
           monto = 2156747, moneda = 'ARS', tipo = 'ingreso',
           dia = coalesce(dia, 6), medio = coalesce(nullif(medio, ''), 'debito'),
           coincide = coalesce(nullif(coincide, ''), ''), updated_at = now()
     where user_id = mi_id and lower(nombre) = lower('Sueldo');
  else
    insert into public.recurrentes (id, user_id, tipo, nombre, categoria, monto, moneda, dia, medio, estado, coincide, historial, created_at, updated_at)
    values (gen_random_uuid(), mi_id, 'ingreso', 'Sueldo', '', 2156747, 'ARS', 6, 'debito', 'activo',
            '', '{"2025-08":1783126,"2026-06":2156747}'::jsonb, '2025-08-01', now());
  end if;

  ---------------------------------------------------------------
  -- 4. Cuotas de Mercado Pago (resumen de septiembre, vence 2026-09-10)
  ---------------------------------------------------------------

  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = 49900 and cuota_total = 2) then
    update public.cuotas
       set cuota_actual = 1, fecha_primer_venc = '2026-09-10', estado = 'activa', descripcion = 'Mercado Libre'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = 49900 and cuota_total = 2;
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, 'Mercado Libre', 'mp', 49900, 1, 2, '2026-09-10', 'activa', 'ARS', '2026-08-07');
  end if;

  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = 56000 and cuota_total = 2) then
    update public.cuotas
       set cuota_actual = 1, fecha_primer_venc = '2026-09-10', estado = 'activa', descripcion = 'Mercado Libre'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = 56000 and cuota_total = 2;
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, 'Mercado Libre', 'mp', 56000, 1, 2, '2026-09-10', 'activa', 'ARS', '2026-08-07');
  end if;

  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = 45395.77 and cuota_total = 3) then
    update public.cuotas
       set cuota_actual = 1, fecha_primer_venc = '2026-09-10', estado = 'activa', descripcion = 'Mercado Libre'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = 45395.77 and cuota_total = 3;
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, 'Mercado Libre', 'mp', 45395.77, 1, 3, '2026-09-10', 'activa', 'ARS', '2026-08-07');
  end if;

  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = 16177.67 and cuota_total = 9) then
    update public.cuotas
       set cuota_actual = 5, fecha_primer_venc = '2026-09-10', estado = 'activa', descripcion = 'IXPETS'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = 16177.67 and cuota_total = 9;
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, 'IXPETS', 'mp', 16177.67, 5, 9, '2026-09-10', 'activa', 'ARS', '2026-04-17');
  end if;

  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = 280336.67 and cuota_total = 3) then
    update public.cuotas
       set cuota_actual = 3, fecha_primer_venc = '2026-09-10', estado = 'activa', descripcion = 'Volante del auto'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = 280336.67 and cuota_total = 3;
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, 'Volante del auto', 'mp', 280336.67, 3, 3, '2026-09-10', 'activa', 'ARS', '2026-06-06');
  end if;

  if exists (select 1 from public.cuotas where user_id = mi_id and tarjeta = 'mp'
             and round(monto_cuota::numeric,2) = 23999.75 and cuota_total = 4) then
    update public.cuotas
       set cuota_actual = 3, fecha_primer_venc = '2026-09-10', estado = 'activa', descripcion = 'Mercado Libre'
     where user_id = mi_id and tarjeta = 'mp'
       and round(monto_cuota::numeric,2) = 23999.75 and cuota_total = 4;
  else
    insert into public.cuotas (id, user_id, descripcion, tarjeta, monto_cuota, cuota_actual, cuota_total, fecha_primer_venc, estado, moneda, created_at)
    values (gen_random_uuid(), mi_id, 'Mercado Libre', 'mp', 23999.75, 3, 4, '2026-09-10', 'activa', 'ARS', '2026-06-11');
  end if;

  -- Las dos que terminaron con el resumen de agosto: dejan de contar como deuda.
  update public.cuotas set estado = 'completada'
   where user_id = mi_id and tarjeta = 'mp'
     and round(monto_cuota::numeric,2) in (23102.64, 40272.74);

  raise notice 'LISTO';
end $$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select 'huerfanos que quedan' as que, count(*) as n from public.gastos where user_id is null;

select to_char(fecha, 'YYYY-MM') as mes, count(*) as movimientos,
       round(sum(monto) filter (where moneda = 'ARS')) as pesos
  from public.gastos group by 1 order by 1;

select tipo, nombre, moneda, monto,
       (select count(*) from jsonb_object_keys(historial)) as meses_historial
  from public.recurrentes order by tipo, nombre;

select tarjeta, descripcion, cuota_actual || '/' || cuota_total as cuota, monto_cuota
  from public.cuotas where estado = 'activa' and tarjeta = 'mp' order by monto_cuota desc;