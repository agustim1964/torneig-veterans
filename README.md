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
| Joan | Kimbo | CTT Exemple | M | 12345 | 950 |

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
