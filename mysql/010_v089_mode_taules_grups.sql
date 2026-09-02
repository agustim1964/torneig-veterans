-- Torneig Veterans v0.8.9
-- Mode d'ús de taules per categoria en fase de grups.
-- Executar UNA SOLA VEGADA a Aiven.

ALTER TABLE categories
  ADD COLUMN mode_taules_grups ENUM('UNA_PER_GRUP','MAXIM')
  NOT NULL DEFAULT 'UNA_PER_GRUP'
  AFTER format_competicio;
