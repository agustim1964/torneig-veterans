-- Torneig Veterans v0.9.12
-- Data de naixement dels jugadors i importació de l'estat actiu.
-- Executar UNA SOLA VEGADA a la BBDD local i a Oracle/Aiven.

ALTER TABLE jugadors
  ADD COLUMN data_naixement DATE NULL AFTER cognoms;

SELECT 'v0.9.12 - data_naixement afegida a jugadors' AS resultat;
