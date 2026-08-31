USE torneig_veterans;

CREATE TABLE IF NOT EXISTS taules (
    idtaula INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NOT NULL,
    nom VARCHAR(50) NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    observacions TEXT NULL,
    UNIQUE KEY uk_taula_numero (numero)
);

ALTER TABLE grups
    ADD COLUMN idtaula INT NULL;

ALTER TABLE grups
    ADD CONSTRAINT fk_grup_taula
    FOREIGN KEY (idtaula)
    REFERENCES taules(idtaula);

ALTER TABLE partits
    ADD COLUMN idtaula INT NULL;

ALTER TABLE partits
    ADD CONSTRAINT fk_partit_taula
    FOREIGN KEY (idtaula)
    REFERENCES taules(idtaula);
