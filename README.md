# Torneig Veterans

Primera versió del gestor del torneig de veterans de tennis taula.

## Funcions incloses

- Llista de categories.
- Alta i baixa lògica de participants.
- Edició de nom i rànquing.
- Importació de participants des d'Excel o CSV.
- Sorteig de grups.
- Distribució dels participants per rànquing en blocs de 4 amb sistema serp.
- Sorteig aleatori dins de cada bloc de 4.
- Grups de 4, utilitzant grups de 3 quan el nombre de participants no és múltiple de 4.
- Visualització dels grups.
- Moviment manual d'un participant d'un grup a un altre.

## Requisits

- Node.js 18 o superior.
- MySQL.
- La base de dades `torneig_veterans` creada amb l'script anterior.

## Instal·lació

1. Copia `.env.example` a `.env`.
2. Configura usuari, contrasenya i servidor MySQL.
3. Executa:

```bash
npm install
npm start
```

4. Obre:

```text
http://localhost:3000
```

## Format de l'Excel / CSV

La primera fila ha de contenir capçaleres. S'admeten aquests noms:

- `nom`
- `cognoms`
- `club`
- `sexe`
- `llicencia`
- `ranking`
- `nom_mostrar`

`nom` és obligatori si no s'informa `nom_mostrar`.

Exemple:

| nom | cognoms | club | sexe | llicencia | ranking |
| --- | --- | --- | --- | --- | --- |
| Joan | Masip | CTT Exemple | M | 12345 | 950 |

## Sorteig

Els participants actius s'ordenen per rànquing descendent.

Es processen en blocs de quatre. Cada bloc es barreja aleatòriament i es distribueix seguint el patró de grups en serp.

Amb 8 grups:

- bloc 1: grups 1,2,3,4
- bloc 2: grups 5,6,7,8
- bloc 3: grups 8,7,6,5
- bloc 4: grups 4,3,2,1
- i es repeteix.

El sorteig queda guardat a `grup_participants`, per tant després es poden fer canvis manuals.

## Següents passos previstos

- Generació dels partits de cada grup.
- Introducció de resultats.
- Classificació automàtica.
- Fase Final A i Consolació.
- Quadres de 8/16/32/64/128.
- BYE segons rànquing.
- Impressió d'actes.


## Versió 0.2 - Gestió de taules

Executa una vegada:

```sql
mysql/002_taules.sql
```

Després apareix **Taules** al menú principal.

Funcions:

- crear una taula;
- editar número, nom i observacions;
- activar/desactivar;
- eliminar si encara no està utilitzada;
- configurar automàticament el nombre de taules actives.

Per exemple, configurar `20` crea o activa les taules 1..20.
Les taules superiors es desactiven, no s'eliminen.

La base de dades queda també preparada per assignar una taula habitual
a cada grup i una taula concreta a cada partit.

## Versió 0.3 - Dependències actualitzades

Canvis de seguretat i manteniment:

- eliminat `xlsx` (SheetJS) de npm;
- importació `.xlsx` ara amb `exceljs`;
- `multer` actualitzat a 2.x;
- es manté la importació `.xlsx` i `.csv`;
- CSV accepta separador `;` o `,`;
- es mantenen totes les funcions de gestió de taules de la v0.2.

Després de substituir els fitxers de la versió anterior:

```bat
rmdir /s /q node_modules
del package-lock.json
npm install
npm audit
npm start
```


## Versió 0.4

- Nova taula `competicions`.
- Una competició conté múltiples categories.
- Les categories existents s'assignen automàticament a `Competició inicial`.
- Sorteig amb dos modes: `Serp 2x2` i `Serp 4x4`.
- Els primers caps de sèrie NO es sortegen: 1r ranking al Grup 1, 2n al Grup 2, etc.
- La serp comença quan s'assigna el segon participant de cada grup.
- La importació de participants de la v0.3 es manté sense canvis.

Abans d'arrencar la v0.4 executa una sola vegada:

```sql
mysql/003_competicions_i_sorteig.sql
```


## Versió 0.5 - Partits, classificació i horaris

Abans d'arrencar:

```sql
mysql/004_partits_classificacio_horaris.sql
```

Novetats:

- configuració per competició:
  - durada estimada partit de grup (20 min per defecte);
  - durada estimada eliminatòria (25 min per defecte);
  - hora general d'inici;
- generació automàtica de tots els partits de cada grup;
- assignació automàtica d'hora i taula activa;
- evita que un mateix participant tingui dos partits simultanis;
- entrada del resultat del partit;
- classificació provisional per grup.

La programació automàtica d'aquesta versió es fa per categoria.
Més endavant es podrà crear un planificador global de totes les categories.


## Versió 0.6 - Desempats reglamentaris de grup

La classificació funciona així:

1. Nombre de victòries.
2. Si dos o més participants empaten, només es consideren els partits entre els empatats.
3. Factor de jocs: jocs guanyats / jocs perduts.
4. Si continua l'empat, factor de punts: punts guanyats / punts perduts.

Per poder calcular el factor de punts, ara el resultat del partit es registra
amb el marcador de cada joc (fins a 5 jocs). El resultat global 3-0, 3-1 o 3-2
es calcula automàticament.


## Versió 0.7
Executa `mysql/005_master_programacio_grups.sql`. Màster general, una taula fixa per grup, darrer partit 2-3 en grup de 4 i 1-2 en grup de 5, grup únic per 5 participants.

## Versió 0.8 - Màster multidia, àrbitres i sorteig per club/país

### Migració obligatòria

Abans de desplegar la v0.8 sobre una BBDD v0.7 existent, executa **una sola vegada**:

```sql
mysql/006_v08_master_arbitres_pais.sql
```

Aquesta migració:

- afegeix `pais` a `jugadors`;
- afegeix `club` i `pais` a `participants`;
- afegeix `idarbitre_participant` a `partits`;
- recupera el club dels participants existents quan és possible.

### Novetats

- Màster amb **data + hora + taula**.
- Els grups es poden distribuir entre diversos dies.
- Els grups bloquejats no es recalculen.
- Cada partit de grup rep un **àrbitre del mateix grup** que no disputa aquell partit.
- Els arbitratges s'intenten repartir equitativament.
- Full A4 imprimible per grup amb participants, taula, horari, ordre de partits, àrbitre i espais per resultats.
- Club i país visibles a participants i grups.
- La importació Excel/CSV accepta també la columna `pais` (també `country` o `nacio`).
- Sorteig serp 2x2 i 4x4 mantingut.
- Dins de cada bloc de rànquing, el sorteig intenta minimitzar primer coincidències de club i després de país.
- Avisos visuals si un grup acaba amb 3 o més participants del mateix club o país.

### Desplegament GitHub + Render + Aiven

1. Fes còpia de seguretat de la BBDD Aiven.
2. Executa `mysql/006_v08_master_arbitres_pais.sql` a Aiven.
3. Copia/substitueix els fitxers de la v0.8 al projecte local.
4. Prova localment amb `npm start`.
5. Quan sigui correcte:

```bat
git status
git add .
git commit -m "Versio 0.8 - master multidia, arbitres i actes de grup"
git push origin main
```

6. Render farà el desplegament automàtic des de GitHub.

No tornis a executar l'script complet d'instal·lació v0.7 sobre Aiven.


## v0.8.1 - Entrada ràpida i impressió del màster

- Entrada ràpida de resultats al millor de 5:
  - si s'escriu 0..9 en un dels dos camps d'un joc, l'altre jugador rep 11 automàticament;
  - el cursor passa al joc següent;
  - quan un jugador arriba a 3 jocs, els jocs posteriors queden desactivats i s'envia el resultat;
  - els jocs ja introduïts continuen editables per poder corregir errors;
  - el servidor descarta qualsevol joc posterior al tercer joc guanyat.
- Nova impressió del màster en A4 horitzontal:
  - una pàgina per dia;
  - taules en columnes;
  - hores en files;
  - categoria i grup a cada intersecció.
- La vista del màster queda preparada conceptualment perquè, quan s'afegeixin eliminatòries,
  les cel·les puguin mostrar la ronda (1/16, 1/8, 1/4, etc.) en lloc del grup.


## v0.8.6 - Top X / grup únic

- Nou format de categoria `Top X / grup únic`.
- Es pot escollir en crear una categoria o canviar-lo des del llistat de categories.
- Un Top X crea un únic grup amb tots els participants actius ordenats per rànquing.
- Calendari tots-contra-tots pel mètode Berger.
- Els partits guarden el número de ronda (`ronda_grup`).
- Amb un nombre imparell de participants, el mètode Berger incorpora automàticament els descansos.
- Assignació d'àrbitres continua equilibrant els arbitratges entre participants que no juguen aquell partit.
- L'acta impresa mostra les rondes del Top X.
- La pantalla de partits mostra la ronda i identifica la classificació com a final quan tots els partits estan acabats.
- No es genera cap Final A ni Consolació en format Top X.
- El màster identifica els blocs de grup únic com `TOP X`.
- Canviar el format queda bloquejat si ja existeixen partits.
- Reconstruir un Top X queda bloquejat si hi ha resultats desats.
- Validació de resultats també al servidor: no es pot desar un joc reglamentàriament impossible manipulant el formulari.


## v0.8.7 - taules disponibles i Top X simultani
- Configuració del nombre de taules disponibles per competició.
- El màster només utilitza aquest nombre de taules actives.
- Grups normals: 1 taula per grup.
- Top X: floor(X/2) taules simultànies per ronda.
- Top X parell: X/2 partits simultanis per ronda.
- Top X imparell: floor(X/2) partits simultanis i un jugador descansa.
- La durada del bloc Top X és nombre de rondes x durada de partit, no nombre total de partits x durada.
- Els partits d'una mateixa ronda reben la mateixa hora i es reparteixen entre les taules assignades.
- El màster imprimible mostra el Top X ocupant totes les seves taules.
- En Top X no s'assignen àrbitres-jugadors automàticament quan s'utilitza la màxima simultaneïtat; caldrà definir arbitratge extern o una política específica.


## v0.8.8 - Màster global i entrada de resultats per focus

- Màster global: distribueix automàticament totes les categories no bloquejades entre els dies de la competició.
- Respecta hora d'inici, hora final de jornada i nombre de taules disponibles.
- Els Top X ocupen `floor(X/2)` taules simultànies.
- Els grups normals ocupen una taula.
- Nova configuració `tipus_arbitratge`: jugadors del grup o àrbitres externs.
- Amb àrbitres externs no s'assigna cap participant com a àrbitre.
- Entrada de resultats confirmable amb Enter o en perdre el focus.
- Si s'entra 0..9, completa 11 a l'altre jugador i passa al joc següent.
- Amb 10 o més cal completar manualment el marcador contrari.
- Es manté la validació reglamentària dels avantatges.


## v0.8.9 - Mode de taules per grup

- Cada categoria normal pot escollir:
  - `UNA_PER_GRUP`: comportament anterior.
  - `MAXIM`: utilitza `floor(jugadors/2)` taules simultànies per grup.
- El valor per defecte és `UNA_PER_GRUP`, per no alterar categories existents.
- Grup de 4 en mode màxim: 2 taules, 3 franges.
- Ordre específic de grup de 4:
  1. 1-4 i 3-2
  2. 1-3 i 2-4
  3. 1-2 i 3-4
- Això conserva 1-2 i 3-4 com a darrera franja.
- El màster global té en compte les taules necessàries i la reducció de durada.
- Les actes mostren la franja quan el grup es disputa en paral·lel.


## v0.9.0 - Quadre A i Consolació

- Nova pantalla de fase final per categoria.
- Quadre A: passen 1r i 2n de cada grup.
- Consolació: passen la resta de participants del grup.
- El número de grup determina el pes dels caps de sèrie:
  - Grup 1 i 2 als dos extrems del quadre.
  - Grups 3 i 4 se sortegen entre les dues meitats.
  - Grups 5..8 se sortegen dins la banda següent, i així successivament.
- Els segons (i els classificats secundaris de Consolació) es col·loquen
  evitant primera ronda contra un jugador del mateix grup i intentant
  retardar qualsevol reenfrontament.
- Quadre automàtic a la potència de 2 superior: 8, 16, 32, 64, 128...
- Els BYEs beneficien primer els caps de sèrie de més pes.
- Es creen totes les rondes i els partits del quadre.
- Els BYEs avancen automàticament.
- En desar un resultat eliminatori, el guanyador passa a la ronda següent.
- El sorteig es pot repetir mentre no hi hagi resultats eliminatoris reals.
- Quan ja hi ha resultats, el sorteig queda bloquejat.
