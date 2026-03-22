/**
 * Repository for Database Operations
 */
var Repository = (function () {
  var APP_SCHEMA = "trackmania";
  var SPROCKET_SCHEMA = "sprocket";
  var ELIGIBILITY_POINTS = 3;

  function findTrackmaniaPlayerId(conn, platformAccountId, fallbackDiscordUsername) {
    if (platformAccountId !== null && platformAccountId !== undefined && String(platformAccountId).trim() !== "") {
      var stmt = conn.prepareStatement(
        "SELECT lp.id " +
          'FROM "' + APP_SCHEMA + '".players lp ' +
          'JOIN "' + SPROCKET_SCHEMA + '".user_authentication_account uaa ' +
          '  ON uaa."accountId" = lp.discord_id ' +
          ' AND uaa."accountType" = \'DISCORD\' ' +
          'JOIN "' + SPROCKET_SCHEMA + '".user u ON u.id = uaa."userId" ' +
          'JOIN "' + SPROCKET_SCHEMA + '".member m ON m."userId" = u.id ' +
          'JOIN "' + SPROCKET_SCHEMA + '".member_platform_account mpa ON mpa."memberId" = m.id ' +
          'JOIN "' + SPROCKET_SCHEMA + '".player sp ON sp."memberId" = m.id ' +
          'JOIN "' + SPROCKET_SCHEMA + '".game_skill_group gsg ON gsg.id = sp."skillGroupId" ' +
          'JOIN "' + SPROCKET_SCHEMA + '".game g ON g.id = gsg."gameId" ' +
          'WHERE mpa."platformAccountId" = ? ' +
          "  AND g.title = 'Trackmania' " +
          "LIMIT 1"
      );
      stmt.setString(1, String(platformAccountId));
      var rs = stmt.executeQuery();
      var playerId = rs.next() ? rs.getInt("id") : null;
      rs.close();
      stmt.close();
      if (playerId) return playerId;
    }

    if (fallbackDiscordUsername && String(fallbackDiscordUsername).trim() !== "") {
      var fallbackStmt = conn.prepareStatement(
        'SELECT id FROM "' + APP_SCHEMA + '".players WHERE discord_username = ? LIMIT 1'
      );
      fallbackStmt.setString(1, String(fallbackDiscordUsername));
      var fallbackRs = fallbackStmt.executeQuery();
      var fallbackPlayerId = fallbackRs.next() ? fallbackRs.getInt("id") : null;
      fallbackRs.close();
      fallbackStmt.close();
      return fallbackPlayerId;
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
  function saveMatchResults(scrimId, parsedMap, winnerTeam) {
    var conn = Database.getConnection();
    conn.setAutoCommit(false);

    try {
      // 1. Update Scrim Status
      var updateScrim = conn.prepareStatement(
        'UPDATE "' +
          APP_SCHEMA +
          "\".scrims SET status = 'completed', completed_at = NOW(), winner_team = ? WHERE id = ?"
      );
      updateScrim.setInt(1, winnerTeam);
      updateScrim.setInt(2, scrimId);
      updateScrim.executeUpdate();

      // 2. Insert Match Player Stats
      var insertStats = conn.prepareStatement(
        'INSERT INTO "' +
          APP_SCHEMA +
          '".match_player_stats ' +
          "(scrim_id, map_id, player_id, team_id, points, is_finished, is_dnf, nb_respawns, best_time) " +
          'VALUES (?, (SELECT id FROM "' +
          APP_SCHEMA +
          '".maps WHERE uid = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?)'
      );

      var unresolvedDrivers = [];

      parsedMap.driverPlacements.forEach(function (driver) {
        var playerId = findTrackmaniaPlayerId(conn, driver.id, driver.name);
        if (!playerId) {
          unresolvedDrivers.push(
            (driver.name || "Unknown") +
              (driver.id ? " [" + driver.id + "]" : "")
          );
          return;
        }

        insertStats.setInt(1, scrimId);
        insertStats.setString(2, parsedMap.mapId || "");
        insertStats.setInt(3, playerId);
        insertStats.setInt(4, parseInt(driver.team));
        insertStats.setInt(5, driver.points);
        insertStats.setBoolean(6, driver.status === "Finished");
        insertStats.setBoolean(7, driver.status === "DNF");
        insertStats.setInt(8, driver.nbRespawns);

        // Handle bestTime (might be string or number)
        var bestTime =
          typeof driver.bestTime === "number" ? driver.bestTime : 0;
        insertStats.setInt(9, bestTime);

        insertStats.addBatch();
      });

      if (unresolvedDrivers.length > 0) {
        throw new Error(
          "Unable to resolve replay players in Trackmania DB: " +
            unresolvedDrivers.join(", ")
        );
      }

      insertStats.executeBatch();

      conn.commit();
      return true;
    } catch (e) {
      conn.rollback();
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
        'SELECT DISTINCT player_id FROM "' +
          APP_SCHEMA +
          '".scrim_players WHERE scrim_id = ?'
      );
      playerStmt.setInt(1, scrimId);
      var playerRs = playerStmt.executeQuery();

      var playerIds = [];
      while (playerRs.next()) {
        playerIds.push(playerRs.getInt("player_id"));
      }
      playerRs.close();
      playerStmt.close();

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
