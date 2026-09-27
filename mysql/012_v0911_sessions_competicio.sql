-- Torneig Veterans v0.9.11 - Sessions de competició
-- Executar UNA SOLA VEGADA a Aiven.

CREATE TABLE IF NOT EXISTS sessions_competicio (
  idsessio INT AUTO_INCREMENT PRIMARY KEY,
  idcompeticio INT NOT NULL,
  nom VARCHAR(80) NOT NULL,
  data DATE NOT NULL,
  hora_inici TIME NOT NULL,
  hora_final TIME NOT NULL,
  nombre_taules INT NOT NULL DEFAULT 1,
  ordre INT NOT NULL DEFAULT 1,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  observacions VARCHAR(255) NULL,
  CONSTRAINT fk_sessions_competicio
    FOREIGN KEY (idcompeticio) REFERENCES competicions(idcompeticio)
    ON DELETE CASCADE,
  INDEX idx_sessions_competicio_data (idcompeticio, data, hora_inici)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
