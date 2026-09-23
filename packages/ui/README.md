# Shared visual foundations

Warm paper/surface colors, graphite text, forest controls and a restrained amber
accent support the Modern Apiary direction. The foundation uses system sans
serif and Georgia without a font download. Replace fonts only after licensing
and performance review. Tokens centralize spacing, colors, radii, shadows,
typography, motion and stacking layers.

Layout is mobile first. At 48rem, content gains wider gutters and the foundation
category list becomes three columns. At 75rem+ content remains capped at 76rem.
Breakpoints are documented constants because native CSS custom properties do
not work inside media query conditions.

Available primitives: container, button, eyebrow, keyboard skip link, visible
focus and reduced-motion baseline. Add tested input/dialog/drawer primitives
with the first real consumer; do not ship unused component scaffolding.
