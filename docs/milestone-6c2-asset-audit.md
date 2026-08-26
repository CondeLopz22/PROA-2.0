# Milestone 6C.2 - auditoría de imágenes y branding

## Resultado

No existen en el repositorio los assets finales esperados para microbiología/branding:

- `src/assets/branding/login-microbiology.webp`
- `src/assets/branding/sidebar-microbiology.webp`
- logo institucional final de `INFECTOMAG PROA`
- logo final de `HealthSolutions`

## Archivos gráficos encontrados

- `src/assets/hero.png`: ilustración abstracta de plantilla, no relacionada con microbiología/PROA.
- `src/assets/react.svg`: asset de plantilla React.
- `src/assets/vite.svg`: asset de plantilla Vite.
- `public/favicon.svg`: favicon genérico heredado.
- `public/icons.svg`: iconos genéricos.
- `src/assets/branding/README.md`: instrucciones de ubicación para futuros assets.

## Implementación actual

El login y sidebar usan una textura microbiológica abstracta construida con CSS, sin `background-image` externo. Esto evita introducir imágenes aleatorias o con copyright y permite que la aplicación funcione aunque todavía no existan los assets definitivos.

## Pendiente para incorporar assets reales

Cuando estén disponibles, agregar:

- `src/assets/branding/login-microbiology.webp`
- `src/assets/branding/sidebar-microbiology.webp`

Luego conectar esos archivos mediante CSS con overlay navy y baja opacidad, validando desktop, tablet y mobile.

No se realizaron cambios de Supabase, RLS, MARTs, reglas clínicas ni datos.
