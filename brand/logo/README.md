# Logo de Habitta

Fuente maestra de los cinco SVG del logo. Cualquier PNG generado a partir de estos archivos
(favicons, ícono de la app, imágenes embebidas en los correos) debe regenerarse desde aquí si el
logo cambia — no desde una copia local fuera del repositorio.

| Archivo | Colores | Formato | Úsalo en |
| --- | --- | --- | --- |
| `1-full-lockup-stacked.svg` | Navy `#05203b` + verde `#22a040`, a color completo | Ícono + texto apilado | Fondos claros donde hay espacio vertical: encabezado de correo, splash screens |
| `2-icon-color.svg` | Navy `#05203b` + verde `#22a040`, a color completo | Solo ícono | Favicons, íconos de app, cualquier insignia cuadrada sobre fondo claro |
| `3-icon-mono-light.svg` | Blanco hueso `#f4f6f8`, monocromo | Solo ícono | Insignias cuadradas sobre fondos oscuros (navy) |
| `4-lockup-mono-light.svg` | Blanco hueso `#f4f6f8`, monocromo | Ícono + texto horizontal | Encabezados oscuros con espacio horizontal: banner de correo de invitación, footers oscuros |
| `5-lockup-mixed.svg` | Texto blanco hueso + ícono verde `#22a040` | Ícono + texto horizontal | Fondos oscuros donde el acento verde debe resaltar (aún sin uso en el producto) |

## Dónde ya se usan

- `apps/web/public/habitta-mark.svg` — insignia cuadrada (deriva de `2-icon-color.svg` con un
  fondo claro `#f5f7fa` añadido), usada en login, sidebar, asistente de onboarding y como favicon.
- `apps/web/public/{apple-touch-icon,icon-192,icon-512}.png` — renderizados desde
  `apps/web/public/habitta-mark.svg`.
- `apps/site/logo-mark.svg` y `apps/platform-admin/logo-mark.svg` — copia directa del ícono de
  `2-icon-color.svg` (sin fondo, ya que ambos sitios tienen fondo claro propio).
- `apps/api/src/notifications/email-assets.ts` — dos PNG en base64:
  - `HABITTA_EMAIL_LOGO_BASE64`, desde `1-full-lockup-stacked.svg` a 220px de ancho.
  - `HABITTA_EMAIL_LOGO_MONO_BASE64`, desde `4-lockup-mono-light.svg` a 160px de ancho.

## Cómo regenerar los PNG

No hay un script de build para esto (es un cambio poco frecuente). Con Node y
`@resvg/resvg-js`:

```js
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const svg = fs.readFileSync('brand/logo/2-icon-color.svg');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
fs.writeFileSync('salida.png', png);
```
