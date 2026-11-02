const SUPPORTED = ['ca', 'es', 'fr', 'en', 'pt', 'ru'];

const messages = {
  ca: {
    language:'Idioma', catalan:'Català', spanish:'Castellà', french:'Francès', english:'Anglès', portuguese:'Portuguès', russian:'Rus',
    appName:'Torneig Veterans', loginTitle:'Accés al campionat', loginHelp:'Introdueix l’usuari i la contrasenya.',
    username:'Usuari', password:'Contrasenya', signIn:'Entrar', signOut:'Sortir', invalidLogin:'Usuari o contrasenya incorrectes.',
    competitions:'Competicions', categories:'Categories', groups:'Grups', brackets:'Quadres', tables:'Taules', consultation:'consulta',
    readOnlyTitle:'Accés només de consulta', readOnlyText:'L’usuari convidat no pot modificar dades ni accedir a aquesta secció.',
    backCompetitions:'Tornar a competicions', honorBoard:"Quadre d'honor", printHonor:"Imprimir quadre d'honor",
    principal:'PRINCIPAL', mainDraw:'Quadre A', consolationDraw:'Quadre B', consolation:'Consolació', pending:'Pendent', unavailable:'Quadre no disponible',
    participants:'Participants', matches:'Partits', classification:'Classificació final', position:'Pos.', participant:'Participant', country:'País', club:'Club', ranking:'Rànquing',
    date:'Data', dates:'Dates', time:'Hora', table:'Taula', referee:'Àrbitre', match:'Partit', result:'Resultat', wins:'V', losses:'D', gamesRatio:'F. jocs', pointsRatio:'F. punts',
    print:'Imprimir', printGroups:'Imprimir grups', printBracket:'Imprimir quadre', printBrackets:'Imprimir quadres A i B', finalPhase:'Fase final',
    noCompetitions:'No hi ha competicions.', location:'Lloc', start:'Inici', end:'Final', status:'Estat', actions:'Accions', active:'Activa', inactive:'Inactiva', view:'Veure',
    competitionManagement:'Competicions', groupAndDraws:'Grups i quadres', noGroups:'Encara no hi ha grups.', group:'Grup', round:'Ronda', final:'Final', semifinal:'Semifinal',
    tieBreak:'Desempats: només partits entre els participants empatats; primer factor de jocs guanyats/perduts i després factor de punts guanyats/perduts.'
  },
  es: {
    language:'Idioma', catalan:'Catalán', spanish:'Castellano', french:'Francés', english:'Inglés', russian:'Ruso', appName:'Torneo Veteranos',
    loginTitle:'Acceso al campeonato', loginHelp:'Introduce el usuario y la contraseña.', username:'Usuario', password:'Contraseña', signIn:'Entrar', signOut:'Salir', invalidLogin:'Usuario o contraseña incorrectos.',
    competitions:'Competiciones', categories:'Categorías', groups:'Grupos', brackets:'Cuadros', tables:'Mesas', consultation:'consulta', readOnlyTitle:'Acceso solo de consulta', readOnlyText:'El usuario invitado no puede modificar datos ni acceder a esta sección.', backCompetitions:'Volver a competiciones',
    honorBoard:'Cuadro de honor', printHonor:'Imprimir cuadro de honor', principal:'PRINCIPAL', mainDraw:'Cuadro A', consolationDraw:'Cuadro B', consolation:'Consolación', pending:'Pendiente', unavailable:'Cuadro no disponible', participants:'Participantes', matches:'Partidos', classification:'Clasificación final', position:'Pos.', participant:'Participante', country:'País', club:'Club', ranking:'Ranking', date:'Fecha', dates:'Fechas', time:'Hora', table:'Mesa', referee:'Árbitro', match:'Partido', result:'Resultado', wins:'V', losses:'D', gamesRatio:'F. juegos', pointsRatio:'F. puntos', print:'Imprimir', printGroups:'Imprimir grupos', printBracket:'Imprimir cuadro', printBrackets:'Imprimir cuadros A y B', finalPhase:'Fase final', noCompetitions:'No hay competiciones.', location:'Lugar', start:'Inicio', end:'Final', status:'Estado', actions:'Acciones', active:'Activa', inactive:'Inactiva', view:'Ver', competitionManagement:'Competiciones', groupAndDraws:'Grupos y cuadros', noGroups:'Todavía no hay grupos.', group:'Grupo', round:'Ronda', final:'Final', semifinal:'Semifinal', tieBreak:'Desempates: solo partidos entre los participantes empatados; primero factor de juegos ganados/perdidos y después factor de puntos ganados/perdidos.'
  },
  fr: {
    language:'Langue', catalan:'Catalan', spanish:'Espagnol', french:'Français', english:'Anglais', russian:'Russe', appName:'Tournoi Vétérans', loginTitle:'Accès au championnat', loginHelp:"Saisissez le nom d’utilisateur et le mot de passe.", username:'Utilisateur', password:'Mot de passe', signIn:'Connexion', signOut:'Déconnexion', invalidLogin:'Utilisateur ou mot de passe incorrect.', competitions:'Compétitions', categories:'Catégories', groups:'Groupes', brackets:'Tableaux', tables:'Tables', consultation:'consultation', readOnlyTitle:'Accès en lecture seule', readOnlyText:"L’utilisateur invité ne peut pas modifier les données ni accéder à cette section.", backCompetitions:'Retour aux compétitions', honorBoard:"Tableau d’honneur", printHonor:"Imprimer le tableau d’honneur", principal:'PRINCIPAL', mainDraw:'Tableau A', consolationDraw:'Tableau B', consolation:'Consolante', pending:'En attente', unavailable:'Tableau indisponible', participants:'Participants', matches:'Matchs', classification:'Classement final', position:'Pos.', participant:'Participant', country:'Pays', club:'Club', ranking:'Classement', date:'Date', dates:'Dates', time:'Heure', table:'Table', referee:'Arbitre', match:'Match', result:'Résultat', wins:'V', losses:'D', gamesRatio:'Ratio manches', pointsRatio:'Ratio points', print:'Imprimer', printGroups:'Imprimer les groupes', printBracket:'Imprimer le tableau', printBrackets:'Imprimer les tableaux A et B', finalPhase:'Phase finale', noCompetitions:'Aucune compétition.', location:'Lieu', start:'Début', end:'Fin', status:'Statut', actions:'Actions', active:'Active', inactive:'Inactive', view:'Voir', competitionManagement:'Compétitions', groupAndDraws:'Groupes et tableaux', noGroups:'Aucun groupe pour le moment.', group:'Groupe', round:'Tour', final:'Finale', semifinal:'Demi-finale', tieBreak:'Départage : uniquement les matchs entre participants à égalité ; ratio de manches puis ratio de points.'
  },
  en: {
    language:'Language', catalan:'Catalan', spanish:'Spanish', french:'French', english:'English', russian:'Russian', appName:'Veterans Tournament', loginTitle:'Championship access', loginHelp:'Enter your username and password.', username:'Username', password:'Password', signIn:'Sign in', signOut:'Sign out', invalidLogin:'Incorrect username or password.', competitions:'Competitions', categories:'Categories', groups:'Groups', brackets:'Draws', tables:'Tables', consultation:'read only', readOnlyTitle:'Read-only access', readOnlyText:'The guest user cannot change data or access this section.', backCompetitions:'Back to competitions', honorBoard:'Roll of honour', printHonor:'Print roll of honour', principal:'MAIN', mainDraw:'Draw A', consolationDraw:'Draw B', consolation:'Consolation', pending:'Pending', unavailable:'Draw unavailable', participants:'Participants', matches:'Matches', classification:'Final standings', position:'Pos.', participant:'Participant', country:'Country', club:'Club', ranking:'Ranking', date:'Date', dates:'Dates', time:'Time', table:'Table', referee:'Referee', match:'Match', result:'Result', wins:'W', losses:'L', gamesRatio:'Games ratio', pointsRatio:'Points ratio', print:'Print', printGroups:'Print groups', printBracket:'Print draw', printBrackets:'Print draws A and B', finalPhase:'Final stage', noCompetitions:'No competitions.', location:'Location', start:'Start', end:'End', status:'Status', actions:'Actions', active:'Active', inactive:'Inactive', view:'View', competitionManagement:'Competitions', groupAndDraws:'Groups and draws', noGroups:'No groups yet.', group:'Group', round:'Round', final:'Final', semifinal:'Semifinal', tieBreak:'Ties: only matches between tied participants; games won/lost ratio first, followed by points won/lost ratio.'
  },
  pt: {
    language:'Idioma', catalan:'Catalão', spanish:'Espanhol', french:'Francês', english:'Inglês', portuguese:'Português', russian:'Russo', appName:'Torneio de Veteranos', loginTitle:'Acesso ao campeonato', loginHelp:'Introduza o nome de utilizador e a palavra-passe.', username:'Utilizador', password:'Palavra-passe', signIn:'Entrar', signOut:'Sair', invalidLogin:'Utilizador ou palavra-passe incorretos.', competitions:'Competições', categories:'Categorias', groups:'Grupos', brackets:'Quadros', tables:'Mesas', consultation:'apenas consulta', readOnlyTitle:'Acesso apenas para consulta', readOnlyText:'O utilizador convidado não pode alterar dados nem aceder a esta secção.', backCompetitions:'Voltar às competições', honorBoard:'Quadro de honra', printHonor:'Imprimir quadro de honra', principal:'PRINCIPAL', mainDraw:'Quadro A', consolationDraw:'Quadro B', consolation:'Consolação', pending:'Pendente', unavailable:'Quadro indisponível', participants:'Participantes', matches:'Partidas', classification:'Classificação final', position:'Pos.', participant:'Participante', country:'País', club:'Clube', ranking:'Ranking', date:'Data', dates:'Datas', time:'Hora', table:'Mesa', referee:'Árbitro', match:'Partida', result:'Resultado', wins:'V', losses:'D', gamesRatio:'F. jogos', pointsRatio:'F. pontos', print:'Imprimir', printGroups:'Imprimir grupos', printBracket:'Imprimir quadro', printBrackets:'Imprimir quadros A e B', finalPhase:'Fase final', noCompetitions:'Não existem competições.', location:'Local', start:'Início', end:'Fim', status:'Estado', actions:'Ações', active:'Ativa', inactive:'Inativa', view:'Ver', competitionManagement:'Competições', groupAndDraws:'Grupos e quadros', noGroups:'Ainda não existem grupos.', group:'Grupo', round:'Ronda', final:'Final', semifinal:'Semifinal', tieBreak:'Desempates: apenas partidas entre participantes empatados; primeiro o fator de jogos ganhos/perdidos e depois o fator de pontos ganhos/perdidos.'
  },
  ru: {
    language:'Язык', catalan:'Каталанский', spanish:'Испанский', french:'Французский', english:'Английский', russian:'Русский', appName:'Турнир ветеранов', loginTitle:'Вход в систему турнира', loginHelp:'Введите имя пользователя и пароль.', username:'Пользователь', password:'Пароль', signIn:'Войти', signOut:'Выйти', invalidLogin:'Неверное имя пользователя или пароль.', competitions:'Соревнования', categories:'Категории', groups:'Группы', brackets:'Сетки', tables:'Столы', consultation:'только просмотр', readOnlyTitle:'Доступ только для просмотра', readOnlyText:'Гостевой пользователь не может изменять данные или открывать этот раздел.', backCompetitions:'Назад к соревнованиям', honorBoard:'Доска почёта', printHonor:'Печать доски почёта', principal:'ОСНОВНАЯ', mainDraw:'Сетка A', consolationDraw:'Сетка B', consolation:'Утешительная', pending:'Ожидается', unavailable:'Сетка недоступна', participants:'Участники', matches:'Матчи', classification:'Итоговая таблица', position:'Место', participant:'Участник', country:'Страна', club:'Клуб', ranking:'Рейтинг', date:'Дата', dates:'Даты', time:'Время', table:'Стол', referee:'Судья', match:'Матч', result:'Результат', wins:'В', losses:'П', gamesRatio:'Соотн. партий', pointsRatio:'Соотн. очков', print:'Печать', printGroups:'Печать групп', printBracket:'Печать сетки', printBrackets:'Печать сеток A и B', finalPhase:'Финальный этап', noCompetitions:'Соревнований нет.', location:'Место', start:'Начало', end:'Окончание', status:'Статус', actions:'Действия', active:'Активна', inactive:'Неактивна', view:'Открыть', competitionManagement:'Соревнования', groupAndDraws:'Группы и сетки', noGroups:'Групп пока нет.', group:'Группа', round:'Раунд', final:'Финал', semifinal:'Полуфинал', tieBreak:'При равенстве учитываются матчи между участниками: сначала соотношение партий, затем соотношение очков.'
  }
};

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(item => {
    const at = item.indexOf('=');
    return at < 0 ? ['', ''] : [item.slice(0, at).trim(), decodeURIComponent(item.slice(at + 1))];
  }).filter(([key]) => key));
}

function localeMiddleware(req, res, next) {
  const requested = req.query.lang || parseCookies(req).torneig_locale;
  const locale = SUPPORTED.includes(requested) ? requested : 'ca';
  req.locale = locale;
  res.locals.locale = locale;
  res.locals.requestUrl = req.originalUrl;
  res.locals.languages = SUPPORTED;
  res.locals.t = key => messages[locale][key] || messages.ca[key] || key;
  next();
}

function setLocale(req, res) {
  const locale = SUPPORTED.includes(req.body.locale) ? req.body.locale : 'ca';
  res.cookie('torneig_locale', locale, { sameSite:'lax', maxAge:365*24*60*60*1000, path:'/' });
  const returnTo = String(req.body.returnTo || req.get('referer') || '/competitions');
  res.redirect(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/competitions');
}

module.exports = { localeMiddleware, setLocale, SUPPORTED };
