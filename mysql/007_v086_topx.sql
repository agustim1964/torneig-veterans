-- Torneig Veterans v0.8.6 - suport Top X / grup únic
-- Executar UNA SOLA VEGADA sobre la BBDD actual d'Aiven.

ALTER TABLE partits
  ADD COLUMN ronda_grup INT NULL AFTER numero_partit;

CREATE INDEX idx_partits_grup_ronda
  ON partits (idgrup, ronda_grup, numero_partit);
