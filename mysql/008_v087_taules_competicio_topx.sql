-- v0.8.7 - taules disponibles per competició i múltiples taules per grup Top X
-- Executar UNA SOLA VEGADA a Aiven.

ALTER TABLE configuracio_competicio
  ADD COLUMN nombre_taules_disponibles INT NOT NULL DEFAULT 20 AFTER hora_inici;

CREATE TABLE IF NOT EXISTS programacio_grup_taules (
  idprogramacio INT NOT NULL,
  idtaula INT NOT NULL,
  ordre INT NOT NULL DEFAULT 1,
  PRIMARY KEY (idprogramacio, idtaula),
  CONSTRAINT fk_pgt_programacio
    FOREIGN KEY (idprogramacio) REFERENCES programacio_grups(idprogramacio) ON DELETE CASCADE,
  CONSTRAINT fk_pgt_taula
    FOREIGN KEY (idtaula) REFERENCES taules(idtaula),
  INDEX idx_pgt_taula (idtaula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Inicialitza les programacions actuals amb la taula principal que ja tenien.
INSERT IGNORE INTO programacio_grup_taules (idprogramacio, idtaula, ordre)
SELECT idprogramacio, idtaula, 1
FROM programacio_grups
WHERE idtaula IS NOT NULL;
