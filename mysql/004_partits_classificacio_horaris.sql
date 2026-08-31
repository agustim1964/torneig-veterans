USE torneig_veterans;

CREATE TABLE IF NOT EXISTS configuracio_competicio (
    idcompeticio INT PRIMARY KEY,
    durada_partit_grups INT NOT NULL DEFAULT 20,
    durada_partit_eliminatories INT NOT NULL DEFAULT 25,
    hora_inici TIME NULL DEFAULT '09:00:00',
    CONSTRAINT fk_config_competicio
        FOREIGN KEY (idcompeticio)
        REFERENCES competicions(idcompeticio)
        ON DELETE CASCADE
);

INSERT INTO configuracio_competicio
    (idcompeticio, durada_partit_grups, durada_partit_eliminatories, hora_inici)
SELECT
    c.idcompeticio, 20, 25, '09:00:00'
FROM competicions c
LEFT JOIN configuracio_competicio cc
    ON cc.idcompeticio = c.idcompeticio
WHERE cc.idcompeticio IS NULL;

-- Evita duplicar partits dins d'un grup si es prem generar més d'una vegada.
CREATE INDEX idx_partits_grup_categoria
    ON partits(idcategoria, idgrup);
