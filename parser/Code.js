//////////////////////
// Web App Entry Point (Simplified and Explicit)
//////////////////////
function doGet(e) {
  const paramId = e.parameter.id || e.parameter.replayId;

  // 1. Require an ID (Scrim UID)
  if (!paramId) {
    return HtmlService.createHtmlOutput(
      "<h2>Error: No Match/Scrim ID provided.</h2><p>Please use a valid URL with ?id=SCRIM_UID</p>"
    )
      .setTitle("Error")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 2. Check Database for Scrim ID
  let scrim;
  try {
    scrim = Repository.getScrimByUid(paramId);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<h2>Database Error: " + err.message + "</h2>"
    );
  }

  if (!scrim) {
    return HtmlService.createHtmlOutput(
      "<h2>Error: Match/Scrim ID not found in database.</h2>"
    );
  }

  // 3. Routing Logic based on Scrim Status and Replay Existence
  const replay = getReplayByScrimUid(scrim.uid);

  // Status: Active or Checking In
  if (scrim.status === "active" || scrim.status === "checking_in") {
    if (replay) {
      // Case: Replays Uploaded -> Verification Screen
      const template = HtmlService.createTemplateFromFile("Verify");
      template.replayId = replay.replayId;
      template.scrimUid = scrim.uid;
      template.scrimIntId = scrim.id;
      return template
        .evaluate()
        .setTitle("Replay Verification")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } else {
      // Case: New/Pending -> Upload Screen
      const template = HtmlService.createTemplateFromFile("Index");
      template.scrim = scrim;
      return template
        .evaluate()
        .setTitle("Replay Submission Tool")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }
  // Status: Completed
  else if (scrim.status === "completed") {
    // Case: Verified -> Results/Report Card
    if (replay) {
      const template = HtmlService.createTemplateFromFile("Verify");
      template.replayId = replay.replayId;
      template.scrimUid = scrim.uid;
      template.scrimIntId = scrim.id;
      // Used to indicate read-only/results mode if needed, though Verify.html handles verified replays well
      template.isReportCard = true;
      return template
        .evaluate()
        .setTitle("Match Results")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } else {
      return HtmlService.createHtmlOutput(
        "<h2>Match Completed, but no replay data found.</h2>"
      );
    }
  }

  // Default/Fallback
  return HtmlService.createHtmlOutput(
    "<h2>Error: Match status unknown (" + scrim.status + ").</h2>"
  );
}

// ====================================================================
// CSS Injector Function (REQUIRED FOR DARK MODE)
// ====================================================================

/**
 * Returns the CSS styles as an HTML output string,
 * ensuring the styles are correctly rendered by the Apps Script sandbox.
 */
function getStyles() {
  const css = `
    /* --- 1. General Body and Container Styling (Preserved Dark Mode) --- */
    body { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
        margin: 0;
        padding: 0; 
        background: #121212; /* Darker background */
        color: #e0e0e0; /* Light text */
        text-align: center; 
    }
    .container { 
        background: #1e1e1e; /* Card background */
        padding: 30px; 
        border-radius: 12px; 
        max-width: 1100px; 
        margin: 40px auto; 
        box-shadow: 0 8px 16px rgba(0,0,0,0.5); 
        border: 1px solid #333;
        text-align: left; 
    }
    h2 { 
        color: #4CAF50; 
        margin-bottom: 30px;
        font-weight: 300;
        letter-spacing: 1px;
        text-align: center;
        border-bottom: 2px solid #333;
        padding-bottom: 10px;
    }
    h3, h4 {
        color: #e0e0e0;
        margin-top: 25px;
        margin-bottom: 15px;
        padding-left: 10px;
        border-left: 4px solid #4CAF50;
    }
    .hidden { 
        display: none !important; 
    }

    /* --- 2. Information Display (Flex Layout for Summary) --- */
    #replay-info-summary {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap; 
        margin-bottom: 20px;
        padding: 10px;
        background: #252525;
        border-radius: 8px;
        border: 1px solid #333;
    }
    .info-item {
        padding: 5px 15px;
        flex-grow: 1; 
        min-width: 180px; 
    }
    .info-item label {
        display: block;
        color: #9e9e9e;
        font-size: 0.85em;
        margin-bottom: 4px;
    }
    .info-item strong {
        font-size: 1.1em;
        color: #ffffff;
    }

    /* --- 3. Form Styling (Flex Layout for Inputs) --- */
    .form-section {
        display: flex;
        gap: 20px;
        margin-top: 20px;
        margin-bottom: 30px;
        flex-wrap: wrap;
    }
    .input-group { 
        flex: 1 1 45%; 
        min-width: 250px;
        text-align: left;
    }
    .input-group label { 
        display: block; 
        margin-bottom: 8px; 
        color: #9e9e9e; 
        font-size: 0.9em; 
        font-weight: 500;
    }
    input[type="text"] { 
        width: 100%; 
        padding: 12px; 
        border-radius: 6px; 
        border: 1px solid #333;
        background: #252525;
        color: white; 
        font-size: 1em;
        transition: border-color 0.3s;
        box-sizing: border-box; 
    }
    input[type="text"]:focus:not([readonly]) { 
        border-color: #4CAF50;
        outline: none;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.5);
    }
    
    /* Button Styling */
    #verifyButton { 
        width: 100%;
        padding: 14px; 
        border-radius: 6px; 
        border: none; 
        color: white; 
        cursor: pointer; 
        font-weight: bold; 
        font-size: 1.1em;
        transition: background 0.3s, transform 0.1s;
        box-sizing: border-box;
        background: #2196F3;
        margin-top: 15px;
    }
    #verifyButton:hover:not(:disabled) { 
        background: #42a5f5;
        transform: translateY(-1px);
    }
    #verifyButton:disabled {
        background: #444;
        cursor: not-allowed;
        transform: none;
    }

    /* --- 4. Table Styling --- */
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
        font-size: 0.9em; 
        table-layout: auto;
    }
    th, td {
        border: 1px solid #333;
        padding: 12px 8px;
        text-align: left;
        word-break: break-all;
    }
    th {
        background: #333;
        color: #4CAF50;
        font-weight: 500;
        text-align: center;
    }
    td {
        background: #2a2a2a;
    }
    tr:nth-child(even) td {
        background: #252525; 
    }

    /* --- 5. Status & Messages --- */
    #message {
        background: #2a2a2a; 
        padding: 15px; 
        border-radius: 8px; 
        text-align: center; 
        font-weight: bold;
        border-left: 4px solid #FF9800;
        margin-bottom: 20px;
    }
    .status-Finished { color: #66BB6A; }
    .status-DNF { color: #f44336; }
    .status-Did_not_participate { color: #9e9e9e; }
    .input-warning {
        border-color: #f44336 !important;
        box-shadow: 0 0 0 2px rgba(244, 67, 54, 0.5);
    }

    /* --- 6. Specialized Sections --- */
    .team-points-summary {
        display: flex;
        justify-content: space-around;
        background: #333;
        padding: 15px;
        border-radius: 8px;
        margin-top: 15px;
        border-left: 4px solid #4CAF50;
        text-align: center;
    }
    .team-score {
        font-size: 1.4em;
        font-weight: bold;
        margin-left: 10px;
        display: block;
    }
    
    /* Map List Styling */
    #mapsPlayedList {
        margin-top: 25px;
        padding: 15px;
        background: #252525;
        border-radius: 8px;
        border: 1px solid #333;
        max-height: 150px;
        overflow-y: auto;
        text-align: left;
    }
    #mapsPlayedList > h4 { 
        font-weight: bold; 
        color: #9e9e9e; 
        margin-bottom: 8px; 
        font-size: 0.9em;
        padding-bottom: 5px;
        border-bottom: 1px solid #333;
        border-left: none; 
        padding-left: 0;
        margin-top: 0;
        text-transform: uppercase;
    }
    #mapList {
        list-style-type: disc;
        padding-left: 20px;
        margin: 5px 0 0 0;
        font-size: 0.95em;
    }
    #mapList li {
        padding: 2px 0;
    }
    #mapList li strong {
        color: #FF9800;
    }
    `;
  // Return the CSS wrapped in <style> tags
  return `<style>${css}</style>`;
}

// ====================================================================
//                          HELPER FUNCTIONS
// ====================================================================

// Consistent constant for temporary name replacement
const TEMP_LOSER_PLACEHOLDER = "TEMP_LOSER_NAME_FOR_CALC";

/**
 * Calculates total map points for each team from the parsed driver data.
 * @param {Array<Object>} driverPlacements - Array of driver objects from the parsed JSON.
 * @returns {Array<{teamName: string, totalPoints: number}>} Sorted by points descending. (teamName is "1" or "2")
 */
function calculateMapScores(driverPlacements) {
  const teamScores = {};

  driverPlacements.forEach((driver) => {
    // The team in driverPlacements is the number 1 or 2
    const team = String(driver.team);
    // Use the player's total points for the map
    const points = driver.points;

    if (team && (team === "1" || team === "2") && typeof points === "number") {
      if (!teamScores[team]) {
        teamScores[team] = 0;
      }
      teamScores[team] += points;
    }
  });

  // Ensure both teams are present even if one has 0 points
  const team1Score = teamScores["1"] || 0;
  const team2Score = teamScores["2"] || 0;

  const scoresArray = [
    { teamName: "1", totalPoints: team1Score },
    { teamName: "2", totalPoints: team2Score },
  ];

  // Sort by points descending, but maintain team 1/2 structure for consistent name mapping later
  scoresArray.sort((a, b) => b.totalPoints - a.totalPoints);

  return scoresArray;
}

/**
 * Calculates the cumulative match points based on all maps for a single Match ID.
 * Reads data from Parsed Results sheet rows.
 * @param {Array<Array<any>>} allMatchMaps - Array of rows from the Parsed Results sheet for one match.
 * @returns {Array<{teamName: string, matchPoints: number, isWinner: boolean}>}
 */
function calculateCumulativeMatchScores(allMatchMaps) {
  // If no teams are found from history, use consistent defaults
  const team1DefaultName = "Team 1";
  const team2DefaultName = "Team 2";

  if (allMatchMaps.length === 0) {
    return [
      { teamName: team1DefaultName, matchPoints: 0, isWinner: false },
      { teamName: team2DefaultName, matchPoints: 0, isWinner: false },
    ];
  }

  const teamTotals = {};
  let teams = new Set(); // Stores all unique, non-empty team names found

  allMatchMaps.forEach((map) => {
    // Column Indices in map[] array (0-based) from Parsed Results sheet:
    // G (index 6): Map Winner Team Name (This is the text name, e.g., "Sabres")
    // P (index 15): Map Winner Pts
    // Q (index 16): Map Loser Pts

    const winnerTeam = String(map[6]).trim();
    const winnerPts =
      typeof map[15] === "number" ? map[15] : parseFloat(map[15] || 0);
    const loserPts =
      typeof map[16] === "number" ? map[16] : parseFloat(map[16] || 0);

    if (winnerTeam) {
      teams.add(winnerTeam);
    }

    if (!winnerTeam || isNaN(winnerPts) || isNaN(loserPts)) return;

    // --- 2. Aggregate Points ---

    // Sum points for winner
    if (!teamTotals[winnerTeam]) teamTotals[winnerTeam] = 0;
    teamTotals[winnerTeam] += winnerPts;

    // Determine Loser Team Name: find the other unique team name
    let loserTeam = Array.from(teams).find((team) => team !== winnerTeam);

    // ********* FIX for First Map: Ensure loser points are tallied *********
    if (!loserTeam && allMatchMaps.length === 1) {
      // If we are only processing the current unverified map (length 1) and haven't found a loser team name yet,
      // use a temporary placeholder name so the points get correctly tallied.
      loserTeam = TEMP_LOSER_PLACEHOLDER; // Use constant
      teams.add(loserTeam); // Add the placeholder so it's picked up in the final step
    }
    // **********************************************************************

    // Sum points for loser
    if (loserTeam) {
      if (!teamTotals[loserTeam]) teamTotals[loserTeam] = 0;
      teamTotals[loserTeam] += loserPts;
    }
  });

  // --- 3. Finalize and Format the Scores ---

  const uniqueTeams = Array.from(teams);

  if (uniqueTeams.length < 2) {
    // This only happens if points were 0-0 or one team was undefined, or the placeholder fix was skipped
    if (uniqueTeams.length === 1) {
      const singleTeamName = uniqueTeams[0];
      // Cannot reliably guess opponent name, use a fallback team name (which will be corrected later in getReplayInfo)
      const opponentName = singleTeamName.toUpperCase().includes("BLUE")
        ? "Red Team"
        : "Opponent";
      return [
        {
          teamName: singleTeamName,
          matchPoints: teamTotals[singleTeamName] || 0,
          isWinner: false,
        },
        { teamName: opponentName, matchPoints: 0, isWinner: false },
      ];
    }
    return [
      { teamName: team1DefaultName, matchPoints: 0, isWinner: false },
      { teamName: team2DefaultName, matchPoints: 0, isWinner: false },
    ];
  }

  // Use the first two distinct teams found
  const T1_name = uniqueTeams[0];
  const T2_name = uniqueTeams[1];
  const T1_score = teamTotals[T1_name] || 0;
  const T2_score = teamTotals[T2_name] || 0;

  // Determine winner status
  const T1_winner = T1_score > T2_score;
  const T2_winner = T2_score > T1_score;

  // Handle ties
  if (T1_score === T2_score) {
    return [
      { teamName: T1_name, matchPoints: T1_score, isWinner: false },
      { teamName: T2_name, matchPoints: T2_score, isWinner: false },
    ];
  }

  // Return in a consistent order (T1, T2)
  return [
    { teamName: T1_name, matchPoints: T1_score, isWinner: T1_winner },
    { teamName: T2_name, matchPoints: T2_score, isWinner: T2_winner },
  ];
}

/**
 * Normalizes a player name.
 * @param {string} name - The raw player name.
 * @returns {string} The normalized name.
 */
function normalizeName(name) {
  if (!name) return "Unknown";
  return name.trim().replace(/[\W_]+$/, "");
}

/**
 * Parses a single map's data from the raw replay JSON.
 * (This is the former ParseReplayJSON logic, modified to take a single map object).
 * @param {Object} mapData - The map object to parse (e.g., from data.maps[i]).
 * @param {string} createdTs - The timestamp from the parent JSON.
 * @param {Array<Object>} teamsData - The teams array from the parent JSON.
 * @returns {Object} The parsed map result.
 */
function ParseSingleMapData(mapData, createdTs, teamsData) {
  const result = {
    mapName: mapData.name || "Unknown",
    mapId: mapData.uid || mapData.id || "Unknown",
    dateTime: createdTs
      ? new Date(createdTs * 1000).toISOString()
      : mapData.date || new Date().toISOString(),
    mapDuration: mapData.duration ?? null, // <- ADDED FOR CONSISTENCY WITH HTML
    driverPlacements: [],
    driverIds: [],
    roundCount: 0,
    mapWinner: null,
    roundWinsSummary: null,
    team1Name: "Team 1",
    team2Name: "Team 2",
  };

  const rounds = mapData.rounds || [];

  // --- Step 1: Extract Team Names ---
  if (teamsData && Array.isArray(teamsData)) {
    // Find the name for Team 1 and Team 2 based on IDs
    teamsData.forEach((t) => {
      if (t.teamId === 1) result.team1Name = t.name;
      if (t.teamId === 2) result.team2Name = t.name;
    });
  }

  const teamWins = {};
  const driverTotals = {};

  // --- Step 2: Aggregate Round-Specific Stats and Initialize All Drivers ---
  for (const round of rounds) {
    const players = round.players || [];
    if (!players.length) continue;

    const roundWinner = players.reduce((winner, p) => {
      const pPoints = p.points ?? 0;
      const winnerPoints = winner ? winner.points ?? 0 : -1;
      return (p.finished || p.roundPoints > 0) && pPoints > winnerPoints
        ? p
        : winner;
    }, null);

    const winningTeam =
      round.roundWinningTeam !== undefined && round.roundWinningTeam !== -1
        ? round.roundWinningTeam
        : roundWinner
        ? roundWinner.team
        : null;

    if (winningTeam !== null) {
      teamWins[winningTeam] = (teamWins[winningTeam] || 0) + 1;
    }

    for (const p of players) {
      if (!p.name) continue;

      const name = normalizeName(p.name);
      if (name === "Unknown") continue;

      if (!driverTotals[name]) {
        driverTotals[name] = {
          id: p.id ?? null,
          name: name,
          team: p.team ?? "Unknown",
          points: 0,
          dnfCount: 0,
          bestTime: Infinity,
          bestTimeActual: "",
          nbRespawns: 0,
          nbRespawnsByCP: 0,
          respawnTimes: [],
          respawnTimeLoss: [],
          roundPoints: [],
          cpTimes: [],
        };
        if (!result.driverIds.includes(name)) {
          result.driverIds.push(name);
        }
      }

      const driver = driverTotals[name];

      const roundPointsValue =
        typeof p.roundPoints === "number" ? p.roundPoints : 0;
      const totalPointsValue = typeof p.points === "number" ? p.points : 0;

      // Use roundNumber as index if available and reliable, otherwise use loop index
      const roundIndex =
        round.roundNumber !== undefined
          ? round.roundNumber
          : rounds.indexOf(round);
      driver.roundPoints[roundIndex] = roundPointsValue;

      if (totalPointsValue > driver.points) {
        driver.points = totalPointsValue;
      }

      const dnf = !!p.dnf;
      if (dnf && (p.finished === false || p.points === 0)) {
        driver.dnfCount++;
      }

      const bestTimeValue = p.bestTime;

      if (typeof bestTimeValue === "number" && bestTimeValue > 0) {
        if (bestTimeValue < driver.bestTime) {
          driver.bestTime = bestTimeValue;
          driver.bestTimeActual = bestTimeValue;

          driver.nbRespawns = p.nbRespawns ?? 0;
          driver.nbRespawnsByCP = Array.isArray(p.nbRespawnsByCp)
            ? p.nbRespawnsByCp.reduce((sum, val) => sum + (val || 0), 0)
            : p.nbRespawnsByCp ?? 0;
          driver.respawnTimes = Array.isArray(p.respawnTimes)
            ? p.respawnTimes
            : [];
          driver.respawnTimeLoss = Array.isArray(p.respawnTimeLoss)
            ? p.respawnTimeLoss
            : [];
          driver.cpTimes = Array.isArray(p.cpTimes) ? p.cpTimes : [];
        }
      }
    }
  }

  const validRoundCount = rounds.filter(
    (r) => (r.players || []).length > 0
  ).length;
  result.roundCount = validRoundCount;

  // Clean up round points array to only include points for valid rounds
  for (const name in driverTotals) {
    const driver = driverTotals[name];
    const cleanedRoundPoints = [];

    for (const round of rounds) {
      if ((round.players || []).length > 0) {
        const roundNumber = round.roundNumber;
        const roundIndex =
          roundNumber !== undefined ? roundNumber : rounds.indexOf(round);

        cleanedRoundPoints.push(
          driver.roundPoints[roundIndex] !== undefined
            ? driver.roundPoints[roundIndex]
            : 0
        );
      }
    }
    driver.roundPoints = cleanedRoundPoints;
  }

  // --- Step 3: Finalize Map and Driver Totals ---
  let mapWinner = Object.keys(teamWins).find((t) => teamWins[t] >= 5);

  if (!mapWinner) {
    const sortedTeams = Object.entries(teamWins).sort((a, b) => b[1] - a[1]);

    if (sortedTeams.length > 0) {
      mapWinner = sortedTeams[0][0];

      if (sortedTeams.length > 1 && sortedTeams[0][1] === sortedTeams[1][1]) {
        mapWinner = "Draw/Tie";
      }
    } else {
      mapWinner = "No Rounds Completed";
    }
  }
  result.mapWinner = mapWinner;
  result.roundWinsSummary = JSON.stringify(teamWins);

  for (const name in driverTotals) {
    const d = driverTotals[name];

    let finalStatus = "Did not participate";
    if (d.points > 0 || d.roundPoints.some((p) => p > 0)) {
      finalStatus = "Finished";
    } else if (d.dnfCount > 0) {
      // Check if DNF occurred *before* any points were scored, implying the driver started but quit early
      // If the map has multiple rounds, and they DNFed a round, but have 0 total points, DNF is a fair status.
      // We will stick to the previous simple logic: total points > 0 means finished, dnfCount > 0 means DNF otherwise Did not participate.
      finalStatus = "DNF";
    }

    result.driverPlacements.push({
      name: d.name,
      id: d.id,
      team: d.team, // Important: This is the number (1 or 2)
      points: d.points,
      status: finalStatus,
      bestTime: d.bestTimeActual || "",
      nbRespawns: d.nbRespawns,
      nbRespawnsByCP: d.nbRespawnsByCP || 0,
      respawnTimes: d.respawnTimes,
      respawnTimeLoss: d.respawnTimeLoss,
      roundPoints: d.roundPoints,
      cpTimes: d.cpTimes,
    });
  }

  result.driverPlacements.sort((a, b) => b.points - a.points);

  return result;
}

/**
 * Parses ALL map data from the raw replay JSON.
 * @param {Object} data - The full JSON object from the replay file.
 * @returns {Array<Object>} An array of parsed map results.
 */
function ParseAllReplayMaps(data) {
  let mapsToProcess = [];
  if (Array.isArray(data.maps)) {
    mapsToProcess = data.maps;
  } else if (data.map) {
    mapsToProcess = [data.map];
  } else if (data.rounds) {
    mapsToProcess = [data];
  }

  if (mapsToProcess.length === 0) {
    throw new Error("No playable map data found in the submitted file.");
  }

  const allParsedMaps = [];

  for (const currentMap of mapsToProcess) {
    const currentRounds = currentMap.rounds || [];
    const currentHasPlayerData = currentRounds.some(
      (round) => (round.players || []).length > 0
    );

    // Only process maps that contain actual player data
    if (currentHasPlayerData) {
      try {
        const parsedMap = ParseSingleMapData(
          currentMap,
          data.createdTs,
          data.teams
        );

        // Calculate map scores right away and attach them
        const mapScores = calculateMapScores(parsedMap.driverPlacements);

        allParsedMaps.push({
          ...parsedMap,
          mapScores: mapScores,
          mapWinnerPoints: mapScores[0].totalPoints,
          mapLoserPoints: mapScores[1].totalPoints,
        });
      } catch (e) {
        Logger.log(
          "Error parsing map: " + currentMap.name + ". Error: " + e.message
        );
      }
    }
  }

  if (allParsedMaps.length === 0) {
    throw new Error(
      "Found map list, but no map contained rounds with player data."
    );
  }

  return allParsedMaps;
}

// ====================================================================
//                          CORE WEB APP FUNCTIONS
// ====================================================================

//////////////////////
// Helper: Find Replay by Scrim UID
//////////////////////
function getReplayByScrimUid(scrimUid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("Temp Submissions");
  if (!tempSheet) return null;

  const data = tempSheet.getDataRange().getValues();
  // Column K (index 10) is Scrim UID
  // Iterate backwards to find the most recent one (if multiple)
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (String(row[10]).trim() === String(scrimUid).trim()) {
      return {
        replayId: row[0],
        scrimUid: row[10],
        status: row[7], // Verified status
        row: row,
      };
    }
  }
  return null;
}

//////////////////////
// Process Replay Upload
//////////////////////
function processReplay(data, submittedBy, matchType, scrimUid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("Temp Submissions");
  if (!tempSheet) throw new Error("Missing 'Temp Submissions' sheet.");

  try {
    // *** NEW: Parse ALL maps instead of just the "best" one ***
    const allParsedMaps = ParseAllReplayMaps(data);

    // For logging to the spreadsheet, we will choose the map with the most rounds,
    // as the sheet structure is designed for single-map submissions.
    let mapToLog = allParsedMaps.reduce((bestMap, currentMap) => {
      return currentMap.roundCount > bestMap.roundCount ? currentMap : bestMap;
    }, allParsedMaps[0]);

    // --- Calculate Map Scores for initial logging ---
    const mapScores = mapToLog.mapScores;

    // The Replay ID is now a dedicated UUID for the submission queue
    const replayId = String(Utilities.getUuid());
    const jsonString = JSON.stringify(data);

    const normalizedMatchType = (matchType || "Unknown").trim();

    // Temp Submissions Columns (A:ReplayID, B:SubmittedBy, C:MatchType, D:MapName, E:MapID, F:DateTime, G:VerifiedBy, H:Verified, I:Timestamp, J:Original JSON)
    tempSheet.appendRow([
      replayId,
      submittedBy,
      normalizedMatchType, // C: Match Type
      mapToLog.mapName, // D: Map Name (Most rounds from the replay)
      mapToLog.mapId, // E: Map ID
      mapToLog.dateTime, // F: Date/Time
      "", // G: Verified By
      "Unverified", // H: Verified Status
      new Date(), // I: Timestamp
      jsonString, // J: Original JSON
      scrimUid || "", // K: Scrim UID (NEW)
    ]);

    setTempFormatting();

    const webAppUrl = ScriptApp.getService().getUrl();
    // Pass page=verify and the unique ID in the link
    const verifyLink = `${webAppUrl}?page=verify&id=${replayId}`;

    // *** NEW: Return all parsed maps for display/preview ***
    return {
      success: true,
      replayId,
      verifyLink,
      parsed: mapToLog, // Kept for backward compatibility, but not really used
      allParsedMaps: allParsedMaps, // The important change
      message: `✅ Replay submitted successfully! Replay ID: ${replayId}. ${allParsedMaps.length} map(s) found in total.`,
    };
  } catch (err) {
    Logger.log("processReplay Error: %s", err.message);
    return {
      success: false,
      message: `❌ Error processing replay: ${err.message}`,
    };
  }
}

//////////////////////
// Replay Info for verifier
//////////////////////
// NEW: Accept an optional mapIdToDisplay parameter
function getReplayInfo(replayId, mapIdToDisplay) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("Temp Submissions");

  if (!tempSheet) throw new Error("Missing 'Temp Submissions' sheet.");

  const tempValues = tempSheet.getDataRange().getValues();

  // Robust string comparison for reliable ID search
  const targetId = String(replayId).trim();

  // Find the submission in Temp Submissions
  // 1. Try by Replay ID (Column A, index 0)
  let mapEntryRowIndex = tempValues.findIndex(
    (row) => String(row[0]).trim() === targetId
  );

  // 2. If not found, Try by Scrim UID (Column K, index 10)
  if (mapEntryRowIndex === -1) {
    mapEntryRowIndex = tempValues.findIndex(
      (row) => String(row[10]).trim() === targetId
    );
  }

  if (mapEntryRowIndex === -1) return null;

  const mapEntry = tempValues[mapEntryRowIndex];

  const originalJson = mapEntry[9]; // J: Original JSON
  const data =
    typeof originalJson === "string" ? JSON.parse(originalJson) : originalJson;

  // *** NEW: Parse ALL maps for verification view ***
  let allParsedMaps;
  try {
    allParsedMaps = ParseAllReplayMaps(data);
  } catch (err) {
    Logger.log("getReplayInfo Error: %s", err.message);
    allParsedMaps = [];
  }

  // *** FILTER OUT 0-SCORE MAPS BEFORE SELECTING DEFAULT ***
  const validMaps = allParsedMaps.filter((map) => {
    const winnerPts = map.mapWinnerPoints || 0;
    return winnerPts > 0;
  });

  // ************************************************************************
  // *** UPDATED MAP SELECTION LOGIC ***
  // 1. Use the map specified by the mapIdToDisplay parameter (from the frontend click).
  // 2. Fallback to the FIRST VALID map (not the one from sheet, which might be 0-0)
  const targetMapId =
    mapIdToDisplay || (validMaps.length > 0 ? validMaps[0].mapId : mapEntry[4]);

  const parsed =
    allParsedMaps.find((m) => m.mapId === targetMapId) || // Match by Map ID
    validMaps[0] || // Fallback to first valid map
    allParsedMaps[0]; // Last resort fallback
  // ************************************************************************

  // *** UPDATED FILTERING: Filter out maps with 0 winner points (stricter filter) ***
  const allMapNamesForDisplay = validMaps.map((map) => ({
    name: map.mapName,
    id: map.mapId, // Include the Map ID for client-side clicking
  }));
  // ************************************************************************

  if (!parsed || !parsed.driverPlacements) {
    // Return partial info if parsing failed but entry exists
    return {
      isVerified: mapEntry[7] === "✅ Verified",
      submittedBy: mapEntry[1],
      mapName: mapEntry[3],
      matchType: mapEntry[2],
      drivers: [],
      teamPoints: [],
      // Use the new display list here
      allMaps: allMapNamesForDisplay,
      defaultMatchSheetId: ss.getId(),
      currentDisplayMapId: targetMapId, // NEW: Send the currently displayed map ID back
    };
  }

  // Calculate Map Points (for the current map submission) - Uses the currently selected 'parsed' map
  const mapScores = calculateMapScores(parsed.driverPlacements);

  // --- Map the winning team number to the team name for display ---
  const winningTeamNumber = mapScores[0].teamName; // This is the string "1" or "2"
  const mapWinnerPts = mapScores[0].totalPoints;
  const mapLoserPts = mapScores[1].totalPoints;

  // Use the names extracted directly by the parser for T1/T2 display
  const team1Name = parsed.team1Name;
  const team2Name = parsed.team2Name;

  let mapWinnerName = winningTeamNumber; // Default to the number if name lookup fails
  if (winningTeamNumber === "1") {
    mapWinnerName = team1Name;
  } else if (winningTeamNumber === "2") {
    mapWinnerName = team2Name;
  }
  const knownNames = [team1Name, team2Name];
  const actualLoserName = knownNames.find((n) => n !== mapWinnerName);

  // --- UPDATED: Show INDIVIDUAL map scores, not cumulative ---
  // Just use the scores for the currently displayed map
  // ************************************************************************
  const team1Data = mapScores.find((d) => d.teamName === "1") || {
    totalPoints: 0,
    teamName: "1",
  };
  const team2Data = mapScores.find((d) => d.teamName === "2") || {
    totalPoints: 0,
    teamName: "2",
  };

  const individualMapScores = [
    {
      teamName: team1Name,
      matchPoints: team1Data.totalPoints,
      isWinner: team1Data.totalPoints > team2Data.totalPoints,
    },
    {
      teamName: team2Name,
      matchPoints: team2Data.totalPoints,
      isWinner: team2Data.totalPoints > team1Data.totalPoints,
    },
  ];

  // Sort by points descending
  individualMapScores.sort((a, b) => b.matchPoints - a.matchPoints);
  // ************************************************************************

  return {
    replayId: mapEntry[0],
    submittedBy: mapEntry[1],
    matchType: mapEntry[2],

    // Send back the details of the CURRENTLY DISPLAYED map, not just the one from the sheet entry
    mapName: parsed.mapName,
    mapId: parsed.mapId,
    dateTime: parsed.dateTime,
    roundCount: parsed.roundCount,
    mapDuration: parsed.mapDuration,
    mapWinner: mapWinnerName,
    roundWinsSummary: parsed.roundWinsSummary,
    drivers: parsed.driverPlacements,

    isVerified: mapEntry[7] === "✅ Verified",
    teamPoints: individualMapScores, // NOW RETURNS INDIVIDUAL MAP SCORES, NOT CUMULATIVE
    defaultMatchId: mapEntry[5] + "_" + mapEntry[3],
    defaultMatchSheetId: ss.getId(),
    team1Name: team1Name,
    team2Name: team2Name,
    mapWinnerPoints: mapWinnerPts,
    mapLoserPoints: mapLoserPts,
    allMaps: allMapNamesForDisplay,
    currentDisplayMapId: parsed.mapId, // NEW: Indicate which map is currently visible
  };
}

//////////////////////
// Verify Replay and move to Database
// data structure: { replayId: string, verifiedBy: string, scrimId: number }
//////////////////////
function verifyReplay(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tempSheet = ss.getSheetByName("Temp Submissions");

  if (!tempSheet) throw new Error("Missing 'Temp Submissions' sheet.");

  const tempValues = tempSheet.getDataRange().getValues();

  for (let i = 1; i < tempValues.length; i++) {
    // Check Replay ID (Column B, index 0)
    if (String(tempValues[i][0]).trim() === String(data.replayId).trim()) {
      const rowNum = i + 1;
      const mapEntry = tempValues[i];

      // 1. Update Temp Submissions verification status
      tempSheet.getRange(rowNum, 7).setValue(data.verifiedBy); // G: Verified By
      tempSheet.getRange(rowNum, 8).setValue("✅ Verified"); // H: Verified
      tempSheet.getRange(rowNum, 9).setValue(new Date()); // I: Timestamp

      setTempFormatting();

      const mapJson = mapEntry[9]; // J: Original JSON
      if (!mapJson)
        return { success: false, message: "❌ JSON missing for this replay." };

      const jsonData =
        typeof mapJson === "string" ? JSON.parse(mapJson) : mapJson;

      // *** Parse ALL maps from the JSON data ***
      const allParsedMaps = ParseAllReplayMaps(jsonData);

      // --- Loop over all maps to save to DB ---
      for (const parsed of allParsedMaps) {
        if (!parsed) continue;

        const mapScores = calculateMapScores(parsed.driverPlacements);
        const winningTeamNumber = mapScores[0].teamName; // "1" or "2"

        // Save to Database
        Repository.saveMatchResults(
          data.scrimId,
          parsed,
          parseInt(winningTeamNumber)
        );
      }

      Repository.awardEligibilityPoints(data.scrimId, 3);

      // Find the map with the most rounds again for the final success message
      let loggedMap = allParsedMaps.reduce((bestMap, currentMap) => {
        return currentMap.roundCount > bestMap.roundCount
          ? currentMap
          : bestMap;
      }, allParsedMaps[0]);

      return {
        success: true,
        message: `✅ Verification successful! Data for ${allParsedMaps.length} map(s) saved to database.`,
        mapName: loggedMap.mapName,
      };
    }
  }

  return { success: false, message: "❌ Replay ID not found." };
}

/**
 * Expose getActiveMatches for the frontend
 */
function getActiveMatches() {
  try {
    return Repository.getActiveMatches();
  } catch (e) {
    Logger.log("Error getting active matches: " + e.message);
    throw e;
  }
}

//////////////////////
// Set Conditional Formatting for Temp Submissions
//////////////////////
function setTempFormatting() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Temp Submissions");
  if (!sheet) return;

  // Temp Submissions structure is A:J
  const range = sheet.getRange("A2:J");
  const rules = sheet.getConditionalFormatRules();

  const newRules = rules.filter((r) => {
    const criteria = r.getBooleanCondition();
    if (!criteria) return true;
    const val = criteria.getCriteriaValues()[0];
    return val !== "Unverified" && val !== "✅ Verified";
  });

  const unverifiedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Unverified")
    .setBackground("#fff176") // Yellow
    .setRanges([range])
    .build();

  const verifiedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("✅ Verified")
    .setBackground("#a5d6a7") // Light Green
    .setRanges([range])
    .build();

  sheet.setConditionalFormatRules([...newRules, unverifiedRule, verifiedRule]);
}
