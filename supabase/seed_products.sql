-- ============================================================================
-- Optional seed: pre-loads the product catalog from her PLIST price list, so the
-- app isn't empty on day one. Safe to run once. Adjust prices/units as needed.
-- (Run AFTER 0001_initial_schema.sql.)
-- ============================================================================
insert into public.products (name, category, unit, price, sort_order) values
  ('BF SHANK',            'beef',    'kg', 450,  10),
  ('BF KALITIRAN',        'beef',    'kg', 580,  20),
  ('BF RIBS SLAB',        'beef',    'kg', 450,  30),
  ('BF RIBS SLICED',      'beef',    'kg', 430,  40),
  ('BF TENDERLOIN',       'beef',    'kg', 1000, 50),
  ('MESENTERY',           'beef',    'kg', 310,  60),
  ('OX TAIL',             'beef',    'kg', 570,  70),
  ('OX TRIPE',            'beef',    'kg', 420,  80),
  ('OX TONGUE',           'beef',    'kg', 550,  90),
  ('GR BEEF',             'beef',    'kg', 480,  100),
  ('CH BREAST',           'chicken', 'kg', 300,  110),
  ('DRUMSTICK',           'chicken', 'kg', 320,  120),
  ('CH LEG QTR',          'chicken', 'kg', 300,  130),
  ('CH LIVER',            'chicken', 'kg', 360,  140),
  ('CH WHOLE',            'chicken', 'kg', 290,  150),
  ('GR PORK LEAN',        'pork',    'kg', 420,  160),
  ('P HEAD MASK',         'pork',    'kg', 420,  170),
  ('LI SAMGY 1CM',        'pork',    'kg', 560,  180),
  ('LI BBR 1INCH',        'pork',    'kg', 520,  190),
  ('LIEMPO BONELESS',     'pork',    'kg', 560,  200),
  ('LIEMPO SKIN OFF',     'pork',    'kg', 560,  210),
  ('LIEMPO WHOLE',        'pork',    'kg', 520,  220),
  ('LI KAWALI',           'pork',    'kg', 540,  230),
  ('P BABY BACK RIBS',    'pork',    'kg', 590,  240),
  ('P PATA FRONT',        'pork',    'kg', 400,  250),
  ('P SKIN',              'pork',    'kg', 160,  260),
  ('P SKIN WITH TABA',    'pork',    'kg', 260,  270),
  ('SALMON HEAD',         'seafood', 'kg', 330,  280),
  ('DORY',                'seafood', 'pc', 1500, 290)
on conflict do nothing;
