-- =========================================================
-- Torneig Veterans v0.8
-- Màster multidia, àrbitres de grup, club i país
-- Executar UNA SOLA VEGADA sobre la BBDD existent (Aiven/local)
-- =========================================================

ALTER TABLE jugadors
    ADD COLUMN pais VARCHAR(3) NULL AFTER club;

ALTER TABLE participants
    ADD COLUMN club VARCHAR(150) NULL AFTER nom_mostrar,
    ADD COLUMN pais VARCHAR(3) NULL AFTER club;

ALTER TABLE partits
    ADD COLUMN idarbitre_participant INT NULL AFTER participant2,
    ADD CONSTRAINT fk_partit_arbitre_participant
        FOREIGN KEY (idarbitre_participant)
        REFERENCES participants(idparticipant);

CREATE INDEX idx_partit_arbitre_participant
    ON partits(idarbitre_participant);

-- Recupera el club dels participants individuals ja existents.
UPDATE participants p
LEFT JOIN participant_jugadors pj
    ON pj.idparticipant = p.idparticipant
   AND pj.ordre = 1
LEFT JOIN jugadors j
    ON j.idjugador = pj.idjugador
SET p.club = COALESCE(p.club, j.club),
    p.pais = COALESCE(p.pais, j.pais)
WHERE p.club IS NULL OR p.pais IS NULL;
