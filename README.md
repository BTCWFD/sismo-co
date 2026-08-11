# Sismo CO

PWA de monitoreo sísmico. Muestra el catálogo revisado del **USGS** y un flujo en vivo
del **EMSC** por WebSocket, en dos paneles separados.

> **Esto no es un sistema de alerta temprana.** Todo lo que muestra la app se publica
> *después* de que el sismo ocurrió. Los sismos no se pueden predecir.
> Emergencias en Colombia: **123** y los canales de la
> [UNGRD](https://portal.gestiondelriesgo.gov.co/).

## Fuentes

| Fuente | Uso | Endpoint |
|---|---|---|
| USGS (fdsnws) | catálogo bajo demanda, magnitudes revisadas | `https://earthquake.usgs.gov/fdsnws/event/1/query` |
| EMSC (seismicportal) | detección rápida, magnitud preliminar | `wss://www.seismicportal.eu/standing_order/websocket` |

Los dos flujos **no se mezclan a propósito**: las magnitudes de redes distintas no son la
misma medida y unirlas genera duplicados que falsean el conteo de réplicas. El panel del
EMSC va marcado como *preliminar*.

Enlaces al SGC, GEOFON y al Global Volcanism Program del Smithsonian están en la app.

## Estructura

```
index.html              armazón de la interfaz
src/app.js              fetch USGS + WebSocket EMSC + registro del service worker
src/styles.css          estilos
manifest.webmanifest    metadatos PWA
sw.js                   service worker (cachea el armazón, nunca los datos)
icons/                  iconos 192 / 512 / maskable
```

## Correr en local

Un servidor estático basta; abrir `index.html` con `file://` no sirve porque el service
worker exige HTTPS o `localhost`.

```bash
npx serve . -l 5173
```

Luego <http://localhost:5173>.

## Despliegue

GitHub Pages sobre la rama `main`, carpeta raíz. El HTTPS que da Pages es lo que permite
instalar la PWA en Android desde Chrome (menú → *Instalar aplicación*).

## Android

El proyecto nativo se genera con Capacitor y **no se versiona** (`android/` está en
`.gitignore`); se recrea con `npx cap add android`. Único permiso necesario:
`android.permission.INTERNET`. La app no usa ubicación, contactos ni almacenamiento.

## Privacidad

No hay analítica, ni cookies, ni backend propio. Las peticiones van directo al USGS y al
EMSC desde el navegador.

## Notas de diseño

- El service worker **nunca** cachea respuestas de otro origen: un sismo viejo servido de
  caché durante una emergencia es peor que un error visible.
- El WebSocket se cierra cuando la pestaña se oculta y reconecta con backoff exponencial
  al volver, para no gastar batería en móvil.
- Los datos remotos se insertan con `textContent`, nunca con `innerHTML`.
