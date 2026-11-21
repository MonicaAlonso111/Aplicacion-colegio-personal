# Chef anti-desperdicio

Aplicación web para reducir el desperdicio de comida en casa. Registras los alimentos que tienes en la nevera y en la despensa, y la app te propone recetas que aprovechan primero lo que está a punto de caducar. También te avisa de lo que caduca pronto y calcula cuánto dinero has ahorrado.

Proyecto personal (PAI) dirigido sobre todo a estudiantes que viven solos y a familias con poco presupuesto.

## Funciones

- **Mi cocina:** inventario de nevera y despensa. Se añade a mano (la app sugiere fecha de caducidad y precio orientativos) o con una foto que reconoce la IA. Los alimentos se ordenan por fecha de caducidad y se marcan con colores: verde, ámbar (5 días o menos) y rojo (2 días o menos).
- **Avisos:** un aviso arriba muestra los alimentos que caducan en 2 días o menos.
- **Recetas:** recetas que usan primero lo que caduca antes, con filtros de rápidas y vegetarianas. Cada receta tiene pasos que se pueden ir marcando y un botón «Ver vídeo» que busca la receta en YouTube.
- **Ahorro:** al cocinar una receta o marcar un alimento como «Usado», eliges cuánto has gastado (entero, la mitad o un poco) y ese porcentaje de su precio se suma al dinero ahorrado. Lo que marcas como «Tirado» se suma a la comida tirada. Incluye un gráfico semanal y un historial.

## Archivos

```
index.html        La app completa (HTML, CSS y JavaScript)
api/gemini.js     Función de servidor para Vercel que habla con la IA de Gemini
README.md         Este archivo
.gitignore        Evita subir archivos con claves por error
```

## Dónde funciona cada cosa

| Dónde se abre | Foto con IA y recetas con IA | Recetario, avisos y ahorro |
|---|---|---|
| Vercel con `GEMINI_API_KEY` configurada | Sí (Gemini) | Sí |
| Dentro de claude.ai (artifact) | Sí (Claude) | Sí |
| Abriendo `index.html` directamente o en GitHub Pages | No | Sí |

## Publicarlo en Vercel con Gemini

1. Consigue una clave de la API de Gemini en Google AI Studio.
2. Entra en vercel.com con tu cuenta de GitHub y pulsa **Add New → Project**.
3. Importa el repositorio **Aplicacion-colegio-personal**. No hace falta cambiar nada de la configuración (Framework Preset: *Other*).
4. Antes de pulsar **Deploy**, abre **Environment Variables** y añade:
   - Nombre: `GEMINI_API_KEY`
   - Valor: tu clave de Gemini
5. Pulsa **Deploy**. Cuando termine, Vercel te da la dirección de la app.

Si añades o cambias la clave después de publicar, ve a **Deployments**, pulsa los tres puntos del último despliegue y elige **Redeploy** para que la use.

Opcional: la variable `GEMINI_MODEL` permite elegir otro modelo (por defecto `gemini-flash-latest`; si falla, prueba `gemini-flash-lite-latest`).

**Importante:** la clave nunca va en el código. Solo se guarda en Vercel. La función `api/gemini.js` es la única que la usa, y construye ella misma las instrucciones para la IA, así que desde fuera solo se puede pedir lo que hace la app (reconocer una foto o proponer recetas).

## Cómo funciona por dentro

- `REF`: tabla de alimentos comunes con los días que suelen durar, un precio orientativo y si van en la nevera o en la despensa.
- `BOOK`: recetario propio. Cada receta tiene huecos de ingredientes; una receta sale si hay en la cocina un alimento para cada hueco.
- `localRecipes()`: puntúa cada receta según lo urgente que es usar sus ingredientes (cuanto antes caducan, más puntos) y muestra las mejores.
- `genRecipes()`: si hay IA (Claude dentro de claude.ai, o Gemini en Vercel), le envía el inventario ordenado por caducidad y le pide 3 recetas en JSON; si falla, usa el recetario propio.
- `api/gemini.js`: recibe la foto o el inventario, llama a Gemini con la clave guardada en Vercel y devuelve el resultado en JSON. Si un modelo falla, prueba con otro más ligero.
- `usageDialog()`: calcula el ahorro (precio × parte gastada) y actualiza el inventario.
