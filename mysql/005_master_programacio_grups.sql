USE torneig_veterans;

CREATE TABLE IF NOT EXISTS programacio_grups (
 idprogramacio INT AUTO_INCREMENT PRIMARY KEY,
 idgrup INT NOT NULL,
 idtaula INT NOT NULL,
 data DATE NULL,
 hora_inici TIME NOT NULL,
 hora_final TIME NOT NULL,
 durada_partit INT NOT NULL DEFAULT 20,
 bloquejada TINYINT(1) NOT NULL DEFAULT 0,
 observacions TEXT NULL,
 CONSTRAINT fk_pg_grup FOREIGN KEY (idgrup) REFERENCES grups(idgrup) ON DELETE CASCADE,
 CONSTRAINT fk_pg_taula FOREIGN KEY (idtaula) REFERENCES taules(idtaula),
 UNIQUE KEY uk_programacio_grup (idgrup)
);

ALTER TABLE categories ADD COLUMN format_competicio ENUM('AUTO','GRUP_UNIC','GRUPS_MES_FINAL') NOT NULL DEFAULT 'AUTO';
