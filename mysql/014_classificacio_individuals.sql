-- Executar abans d'arrencar la versió amb partits de classificació.
-- No modifica els quadres ni els resultats existents. Es pot repetir.
CREATE TABLE IF NOT EXISTS classificacio_fases (
  idfase INT NOT NULL PRIMARY KEY,
  fins_posicio SMALLINT UNSIGNED NOT NULL,
  CONSTRAINT fk_classificacio_fase FOREIGN KEY (idfase) REFERENCES fases(idfase) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classificacio_partits (
  idpartit INT NOT NULL PRIMARY KEY,
  idfase INT NOT NULL,
  posicio_inici SMALLINT UNSIGNED NOT NULL,
  posicio_fi SMALLINT UNSIGNED NOT NULL,
  origen1_partit INT NOT NULL,
  origen1_resultat ENUM('GUANYADOR','PERDEDOR') NOT NULL,
  origen2_partit INT NOT NULL,
  origen2_resultat ENUM('GUANYADOR','PERDEDOR') NOT NULL,
  KEY idx_classificacio_fase (idfase),
  CONSTRAINT fk_classificacio_partit FOREIGN KEY (idpartit) REFERENCES partits(idpartit) ON DELETE CASCADE,
  CONSTRAINT fk_classificacio_partit_fase FOREIGN KEY (idfase) REFERENCES fases(idfase) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classificacio_posicions (
  idfase INT NOT NULL,
  posicio SMALLINT UNSIGNED NOT NULL,
  origen_partit INT NOT NULL,
  origen_resultat ENUM('GUANYADOR','PERDEDOR') NOT NULL,
  PRIMARY KEY (idfase, posicio),
  CONSTRAINT fk_classificacio_posicio_fase FOREIGN KEY (idfase) REFERENCES fases(idfase) ON DELETE CASCADE
);
