/**
 * Database Connection Handler
 * Manages JDBC connection to PostgreSQL
 */
var Database = (function () {
    // Configuration - Replace with your actual credentials or use Script Properties
    var DB_URL = 'jdbc:postgresql://<HOST>:<PORT>/tmscrim';
    var DB_USER = '<USER>';
    var DB_PASSWORD = '<PASSWORD>';

    function getConnection() {
        try {
            return Jdbc.getConnection(DB_URL, DB_USER, DB_PASSWORD);
        } catch (e) {
            Logger.log('Failed to connect to database: ' + e.message);
            throw e;
        }
    }

    return {
        getConnection: getConnection
    };
})();