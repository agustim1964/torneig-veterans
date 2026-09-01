-- Torneig Veterans v0.8.8
-- Màster global + tipus d'arbitratge
-- Executar UNA SOLA VEGADA a Aiven.

ALTER TABLE configuracio_competicio
  ADD COLUMN hora_fi_jornada TIME NOT NULL DEFAULT '20:00:00'
    AFTER hora_inici,
  ADD COLUMN tipus_arbitratge ENUM('JUGADORS','EXTERNS') NOT NULL DEFAULT 'JUGADORS'
    AFTER nombre_taules_disponibles;
