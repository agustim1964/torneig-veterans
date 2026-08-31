USE torneig_veterans;

CREATE TABLE IF NOT EXISTS competicions (
    idcompeticio INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(150) NOT NULL,
    data_inici DATE NULL,
    data_fi DATE NULL,
    lloc VARCHAR(150) NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    observacions TEXT NULL,
    data_creacio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE categories
    ADD COLUMN idcompeticio INT NULL AFTER idcategoria;

ALTER TABLE categories
    ADD CONSTRAINT fk_categoria_competicio
    FOREIGN KEY (idcompeticio)
    REFERENCES competicions(idcompeticio);

CREATE INDEX idx_categoria_competicio
    ON categories(idcompeticio);

INSERT INTO competicions (nom, activa)
SELECT 'Competició inicial', 1
WHERE NOT EXISTS (SELECT 1 FROM competicions);

SET @id_competicio_inicial = (
    SELECT MIN(idcompeticio) FROM competicions
);

UPDATE categories
SET idcompeticio = @id_competicio_inicial
WHERE idcompeticio IS NULL;
