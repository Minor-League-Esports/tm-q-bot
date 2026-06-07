/**
 * Repository for Database Operations
 */
var Repository = (function () {
  var APP_SCHEMA = "trackmania";
  var SPROCKET_SCHEMA = "sprocket";
  var ELIGIBILITY_POINTS = 3;

  function repositoryLog(method, stage, data) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var logSheet = ss.getSheetByName("Logs");
      if (!logSheet) {
        logSheet = ss.insertSheet("Logs");
        logSheet.appendRow(["Timestamp", "Method", "Stage", "Message", "Details"]);
        logSheet.getRange(1, 1, 1, 5).setFontWeight("bold");
        logSheet.setColumnWidths(1, 5, 200);
        logSheet.setColumnWidth(5, 400);
      }
      var timestamp = new Date();
      var details = typeof data === "object" ? JSON.stringify(data) : String(data);
      var shortMsg = typeof data === "string" ? data : (data.message || data.error || "See Details");
      logSheet.appendRow([timestamp, "Repository." + method, stage, shortMsg, details]);
    } catch (e) {}
  }

  function findTrackmaniaPlayer(conn, platformAccountId, fallbackDiscordUsername) {
    repositoryLog("findTrackmaniaPlayer", "LOOKUP", { platformAccountId: platformAccountId, fallbackDiscordUsername: fallbackDiscordUsername });
    if (platformAccountId !== null && platformAccountId !== undefined && String(platformAccountId).trim() !== "") {
      var stmt = conn.prepareStatement(
        "SELECT lp.id, lp.sprocket_player_id " +
          'FROM "' + APP_SCHEMA + '".players lp ' +
          'JOIN "' + SPROCKET_SCHEMA + '".member_platform_account mpa ' +
          '  ON mpa."platformAccountId" = ? ' +
          'JOIN "' + SPROCKET_SCHEMA + '".player sp ' +
          '  ON sp.id = lp.sprocket_player_id ' +
          ' AND sp."memberId" = mpa."memberId" ' +
          'JOIN "' + SPROCKET_SCHEMA + '".game_skill_group gsg ON gsg.id = sp."skillGroupId" ' +
          'JOIN "' + SPROCKET_SCHEMA + '".game g ON g.id = gsg."gameId" ' +
          "WHERE g.title = 'Trackmania' " +
          "LIMIT 2"
      );
      stmt.setString(1, String(platformAccountId));
      var rs = stmt.executeQuery();
      var matches = [];
      while (rs.next()) {
        matches.push({
          localPlayerId: rs.getInt("id"),
          sprocketPlayerId: rs.getInt("sprocket_player_id"),
        });
      }
      rs.close();
      stmt.close();
      if (matches.length === 1) {
        repositoryLog("findTrackmaniaPlayer", "FOUND_PLATFORM", { localPlayerId: matches[0].localPlayerId, sprocketPlayerId: matches[0].sprocketPlayerId });
        return matches[0];
      }
      if (matches.length > 1) {
        throw new Error("Multiple Trackmania players resolved for platform account " + platformAccountId);
      }
    }

    if (fallbackDiscordUsername && String(fallbackDiscordUsername).trim() !== "") {
      var fallbackStmt = conn.prepareStatement(
        'SELECT id, sprocket_player_id FROM "' + APP_SCHEMA + '".players WHERE discord_username = ? LIMIT 2'
      );
      fallbackStmt.setString(1, String(fallbackDiscordUsername));
      var fallbackRs = fallbackStmt.executeQuery();
      var fallbackMatches = [];
      while (fallbackRs.next()) {
        fallbackMatches.push({
          localPlayerId: fallbackRs.getInt("id"),
          sprocketPlayerId: fallbackRs.getInt("sprocket_player_id"),
        });
      }
      fallbackRs.close();
      fallbackStmt.close();
      if (fallbackMatches.length === 1) return fallbackMatches[0];
      if (fallbackMatches.length > 1) {
        throw new Error("Multiple Trackmania players resolved for replay name " + fallbackDiscordUsername);
      }
    }

    return null;
  }

  /**
   * Get all active matches (Queue Scrims + Scheduled Matches)
   * Returns array of { id, uid, league, type, created_at }
   */
  function getActiveMatches() {
    var conn = Database.getConnection();
    var stmt = conn.createStatement();
    var query =
      'SELECT id, scrim_uid, league, match_type, created_at FROM "' +
      APP_SCHEMA +
      "\".scrims WHERE status IN ('active', 'checking_in') ORDER BY created_at DESC";
    var rs = stmt.executeQuery(query);

    var matches = [];
    while (rs.next()) {
      matches.push({
        id: rs.getInt("id"),
        uid: rs.getString("scrim_uid"),
        league: rs.getString("league"),
        type: rs.getString("match_type"),
        created_at: rs.getTimestamp("created_at").toString(),
      });
    }

    rs.close();
    stmt.close();
    conn.close();

    return matches;
  }

  /**
   * Save match results and stats
   * @param {number} scrimId - The internal ID of the scrim
   * @param {Object} parsedMap - The parsed map data
   * @param {number} winnerTeam - 1 or 2
   */
  function saveMatchResults(scrimId, parsedMaps, winnerTeam) {
    repositoryLog("saveMatchResults", "START", { scrimId: scrimId, mapCount: (Array.isArray(parsedMaps) ? parsedMaps.length : 1), winnerTeam: winnerTeam });
    var conn = Database.getConnection();
    conn.setAutoCommit(false);

    try {
      var mapsToSave = Array.isArray(parsedMaps) ? parsedMaps : [parsedMaps];

      var scrimCheck = conn.prepareStatement(
        'SELECT status, elo_processed FROM "' + APP_SCHEMA + '".scrims WHERE id = ? FOR UPDATE'
      );
      scrimCheck.setInt(1, scrimId);
      var scrimRs = scrimCheck.executeQuery();
      if (!scrimRs.next()) {
        throw new Error("Scrim not found for verification.");
      }
      var currentStatus = scrimRs.getString("status");
      var eloProcessed = scrimRs.getBoolean("elo_processed");
      scrimRs.close();
      scrimCheck.close();

      if (currentStatus === "completed" && eloProcessed) {
        conn.rollback();
        return { alreadyProcessed: true, insertedStats: 0 };
      }

      // 1. Update Scrim Status once using cumulative match winner
      var updateScrim = conn.prepareStatement(
        'UPDATE "' +
          APP_SCHEMA +
          '".scrims SET status = \'completed\', completed_at = COALESCE(completed_at, NOW()), winner_team = ? WHERE id = ?'
      );
      updateScrim.setInt(1, winnerTeam);
      updateScrim.setInt(2, scrimId);
      updateScrim.executeUpdate();
      updateScrim.close();

      // 2. Insert Match Player Stats idempotently
      var insertStats = conn.prepareStatement(
        'INSERT INTO "' +
          APP_SCHEMA +
          '".match_player_stats ' +
          "(scrim_id, map_id, player_id, team_id, points, is_finished, is_dnf, round_points, nb_respawns, respawn_times, best_time, cp_times, respawn_time_loss, nb_respawns_by_cp) " +
          'VALUES (?, (SELECT id FROM "' +
          APP_SCHEMA +
          '".maps WHERE uid = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT (scrim_id, COALESCE(map_id, 0), player_id) DO NOTHING'
      );

      var unresolvedDrivers = [];
      var insertedStats = 0;

      mapsToSave.forEach(function (parsedMap) {
        parsedMap.driverPlacements.forEach(function (driver) {
          var player = findTrackmaniaPlayer(conn, driver.id, driver.name);
          if (!player || !player.localPlayerId || !player.sprocketPlayerId) {
            unresolvedDrivers.push(
              (driver.name || "Unknown") +
                (driver.id ? " [" + driver.id + "]" : "")
            );
            return;
          }

          insertStats.setInt(1, scrimId);
          insertStats.setString(2, parsedMap.mapId || "");
          insertStats.setInt(3, player.localPlayerId);
          insertStats.setInt(4, parseInt(driver.team));
          insertStats.setInt(5, driver.points);
          insertStats.setBoolean(6, driver.status === "Finished");
          insertStats.setBoolean(7, driver.status === "DNF");
          insertStats.setArray(8, conn.createArrayOf("integer", driver.roundPoints || []));
          insertStats.setInt(9, driver.nbRespawns || 0);
          insertStats.setArray(10, conn.createArrayOf("integer", driver.respawnTimes || []));

          var bestTime = typeof driver.bestTime === "number" ? driver.bestTime : 0;
          insertStats.setInt(11, bestTime);
          insertStats.setArray(12, conn.createArrayOf("integer", driver.cpTimes || []));
          insertStats.setArray(13, conn.createArrayOf("integer", driver.respawnTimeLoss || []));
          insertStats.setArray(14, conn.createArrayOf("integer", [driver.nbRespawnsByCP || 0]));

          insertStats.addBatch();
          insertedStats++;
        });
      });

      if (unresolvedDrivers.length > 0) {
        throw new Error(
          "Unable to resolve replay players in Trackmania DB: " +
            unresolvedDrivers.join(", ")
        );
      }

      insertStats.executeBatch();
      insertStats.close();

      conn.commit();
      repositoryLog("saveMatchResults", "COMMITTED", { scrimId: scrimId, insertedStats: insertedStats });
      return { alreadyProcessed: false, insertedStats: insertedStats };
    } catch (e) {
      conn.rollback();
      repositoryLog("saveMatchResults", "ERROR", e.message);
      Logger.log("Error saving match results: " + e.message);
      throw e;
    } finally {
      conn.close();
    }
  }

  function awardEligibilityPoints(scrimId, points) {
    var conn = Database.getConnection();
    conn.setAutoCommit(false);

    try {
      var scrimStmt = conn.prepareStatement(
        'SELECT sprocket_match_parent_id FROM "' +
          APP_SCHEMA +
          '".scrims WHERE id = ?'
      );
      scrimStmt.setInt(1, scrimId);
      var scrimRs = scrimStmt.executeQuery();

      if (!scrimRs.next()) {
        throw new Error("Scrim not found for eligibility award.");
      }

      var matchParentId = scrimRs.getInt("sprocket_match_parent_id");
      scrimRs.close();
      scrimStmt.close();

      if (!matchParentId) {
        throw new Error("Scrim is missing sprocket_match_parent_id.");
      }

      var playerStmt = conn.prepareStatement(
        'SELECT DISTINCT p.sprocket_player_id FROM "' +
          APP_SCHEMA +
          '".scrim_players sp ' +
          'JOIN "' + APP_SCHEMA + '".players p ON p.id = sp.player_id ' +
          'WHERE sp.scrim_id = ? AND p.sprocket_player_id IS NOT NULL'
      );
      playerStmt.setInt(1, scrimId);
      var playerRs = playerStmt.executeQuery();

      var playerIds = [];
      while (playerRs.next()) {
        playerIds.push(playerRs.getInt("sprocket_player_id"));
      }
      playerRs.close();
      playerStmt.close();

      if (playerIds.length === 0) {
        throw new Error("No Sprocket player IDs found for scrim eligibility award.");
      }

      var upsertStmt = conn.prepareStatement(
        'INSERT INTO "' +
          SPROCKET_SCHEMA +
          '".eligibility_data ("points", "matchParentId", "playerId") ' +
          "SELECT ?, ?, ? " +
          "WHERE NOT EXISTS (" +
          '  SELECT 1 FROM "' +
          SPROCKET_SCHEMA +
          '".eligibility_data ' +
          '  WHERE "matchParentId" = ? AND "playerId" = ?' +
          ")"
      );

      playerIds.forEach(function (playerId) {
        upsertStmt.setInt(1, points || ELIGIBILITY_POINTS);
        upsertStmt.setInt(2, matchParentId);
        upsertStmt.setInt(3, playerId);
        upsertStmt.setInt(4, matchParentId);
        upsertStmt.setInt(5, playerId);
        upsertStmt.addBatch();
      });

      upsertStmt.executeBatch();
      upsertStmt.close();

      conn.commit();
      return true;
    } catch (e) {
      conn.rollback();
      Logger.log("Error awarding eligibility points: " + e.message);
      throw e;
    } finally {
      conn.close();
    }
  }

  /**
   * Get a scrim by its UID (e.g. from URL)
   * @param {string} uid
   * @returns {Object|null} Scrim object or null
   */
  function getScrimByUid(uid) {
    var conn = Database.getConnection();
    var query =
      'SELECT id, scrim_uid, league, match_type, status, created_at, winner_team FROM "' +
      APP_SCHEMA +
      '".scrims WHERE scrim_uid = ?';
    var stmt = conn.prepareStatement(query);
    stmt.setString(1, uid);
    var rs = stmt.executeQuery();

    var scrim = null;
    if (rs.next()) {
      scrim = {
        id: rs.getInt("id"),
        uid: rs.getString("scrim_uid"),
        league: rs.getString("league"),
        type: rs.getString("match_type"),
        status: rs.getString("status"),
        createdAt: rs.getTimestamp("created_at").toString(),
        winnerTeam: rs.getInt("winner_team"),
      };
    }

    rs.close();
    stmt.close();
    conn.close();

    return scrim;
  }

  return {
    saveMatchResults: saveMatchResults,
    awardEligibilityPoints: awardEligibilityPoints,
    getScrimByUid: getScrimByUid,
  };
})();
