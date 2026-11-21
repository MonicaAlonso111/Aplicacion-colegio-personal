// Función de servidor para Vercel: habla con la API de Gemini.
// La clave NUNCA está en el código: se lee de la variable de entorno GEMINI_API_KEY,
// que se configura en Vercel (Settings → Environment Variables).
// Los textos que se envían a la IA (prompts) se construyen aquí, en el servidor,
// para que nadie pueda usar tu clave para otras cosas desde fuera de la app.

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MODELS = [process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest'];

function clean(s, max) { return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').slice(0, max); }

function photoPrompt(today) {
  return 'Eres el asistente de una app española contra el desperdicio de comida. Mira la foto (una nevera, despensa o compra) y enumera los alimentos que se ven con claridad. ' +
    'Devuelve SOLO JSON con esta forma: {"alimentos":[{"nombre":"Yogures naturales","cantidad":"4 uds","sitio":"nevera" o "despensa","dias_hasta_caducar":número entero estimado para un producto en buen estado,"precio_eur":precio orientativo en un supermercado español}]}. ' +
    'Nombres cortos en español, en plural si hay varios. No inventes productos que no se vean. Si no ves comida, devuelve {"alimentos":[]}. Hoy es ' + clean(today, 10) + '.';
}

function recipesPrompt(inventory, quick, veg) {
  const inv = inventory.slice(0, 60).map(i => '- ' + clean(i.name, 60) + (i.qty ? ' (' + clean(i.qty, 30) + ')' : '') + ': ' + clean(i.label, 30)).join('\n');
  return 'Eres un cocinero casero español que ayuda a no tirar comida. La persona vive sola (o con poco presupuesto) y tiene esto en su cocina, ordenado de lo que caduca antes a lo que menos:\n' + inv +
    '\n\nPropón 3 recetas sencillas y realistas para 1-2 raciones. Reglas:\n1. Cada receta debe usar al menos uno de los alimentos que caducan antes (los primeros de la lista).\n2. Usa SOLO alimentos de la lista, más básicos que casi todo el mundo tiene: aceite, sal, pimienta, agua, azúcar, vinagre, especias secas. Nada más.\n3. No uses alimentos caducados hace más de 2 días.\n4. Pasos claros, cortos, con tiempos y temperaturas.' +
    (quick ? '\n5. Todas en 20 minutos o menos.' : '') + (veg ? '\n6. Todas vegetarianas (sin carne ni pescado).' : '') +
    '\n\nDevuelve SOLO JSON: {"recetas":[{"titulo":"…","minutos":número,"raciones":número,"por_que":"una frase: qué aprovecha que caduca pronto","usa":[{"nombre":"nombre EXACTO como aparece en la lista","cantidad":"ej. 2 uds"}],"basicos":["aceite","sal"],"pasos":["…"]}]}';
}

async function callGemini(model, key, parts) {
  const r = await fetch(API + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((data.error && data.error.message) || ('HTTP ' + r.status));
    err.status = r.status;
    throw err;
  }
  const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
    .map(p => p.text || '').join('').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(text);
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const test = req.query ? req.query.test : /[?&]test=1/.test(req.url || '');
    if (!key || !test) { res.status(200).json({ configured: !!key }); return; }
    // Prueba rápida de la clave con una petición mínima
    try {
      await callGemini(MODELS[0], key, [{ text: 'Responde solo con este JSON: {"ok":true}' }]);
      res.status(200).json({ configured: true, keyOk: true });
    } catch (e) {
      const badKey = e.status === 401 || e.status === 403 || /api key/i.test(e.message || '');
      res.status(200).json({ configured: true, keyOk: badKey ? false : null, error: badKey ? 'bad_key' : (e.status === 429 ? 'rate_limited' : 'failed'), detail: String(e.message || '').slice(0, 200) });
    }
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  if (!key) { res.status(500).json({ error: 'not_configured' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  let parts;
  if (body.task === 'photo') {
    const img = String(body.image || '');
    if (!img || img.length > 3500000 || !/^[A-Za-z0-9+/=]+$/.test(img)) { res.status(400).json({ error: 'bad_image' }); return; }
    parts = [{ text: photoPrompt(body.today) }, { inline_data: { mime_type: 'image/jpeg', data: img } }];
  } else if (body.task === 'recipes') {
    const inv = Array.isArray(body.inventory) ? body.inventory : [];
    if (!inv.length) { res.status(400).json({ error: 'empty' }); return; }
    parts = [{ text: recipesPrompt(inv, !!body.quick, !!body.veg) }];
  } else { res.status(400).json({ error: 'task' }); return; }

  let last;
  for (const model of MODELS) {
    try {
      const out = await callGemini(model, key, parts);
      res.status(200).json(out);
      return;
    } catch (e) {
      last = e;
      // Si la clave es mala no tiene sentido probar otro modelo
      if (e.status === 400 && /api key/i.test(e.message)) break;
      if (e.status === 401 || e.status === 403) break;
    }
  }
  const code = last && last.status === 429 ? 'rate_limited'
    : last && (last.status === 401 || last.status === 403 || /api key/i.test(last.message || '')) ? 'bad_key'
    : 'failed';
  res.status(code === 'rate_limited' ? 429 : 502).json({ error: code, detail: last ? String(last.message).slice(0, 200) : '' });
};
