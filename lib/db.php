<?php
declare(strict_types=1);

const SCHEMA_VERSION = 6;

/**
 * Liefert eine PDO-Verbindung zur SQLite-Datenbank.
 * Legt die Datenbank beim ersten Aufruf an und spielt das Schema ein.
 */
function db(array $config): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $path = $config['db_path'];
    $dir  = dirname($path);

    if (!is_dir($dir)) {
        throw new RuntimeException("Datenbankordner fehlt: $dir");
    }
    // SQLite braucht Schreibrechte auf den ORDNER (Journal-/WAL-Dateien), nicht nur auf die Datei
    if (!is_writable($dir)) {
        throw new RuntimeException("Datenbankordner ist nicht beschreibbar: $dir");
    }

    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');

    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $version = (int) $pdo->query('PRAGMA user_version')->fetchColumn();
    if ($version >= SCHEMA_VERSION) {
        return;
    }
    if ($version < 1) {
        // Neuinstallation: schema.sql enthält bereits den aktuellen Stand
        $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    } else {
        if ($version < 2) {
            $pdo->exec('ALTER TABLE anmeldung ADD COLUMN kenntnis_digitale_kommunikation INTEGER CHECK (kenntnis_digitale_kommunikation IN (0,1))');
            $pdo->exec('ALTER TABLE anmeldung ADD COLUMN grundschule_kontakt INTEGER CHECK (grundschule_kontakt IN (0,1))');
            $pdo->exec('ALTER TABLE anmeldung ADD COLUMN grundschule_hsp INTEGER CHECK (grundschule_hsp IN (0,1))');
        }
        // Schema 3 hatte kurzzeitig eine Einfachauswahl teilnahme_profil; Schema 4 ersetzt sie durch zwei Ja/Nein-Spalten.
        if ($version < 4) {
            $pdo->exec('ALTER TABLE anmeldung ADD COLUMN teilnahme_mint INTEGER CHECK (teilnahme_mint IN (0,1))');
            $pdo->exec('ALTER TABLE anmeldung ADD COLUMN teilnahme_bilingual INTEGER CHECK (teilnahme_bilingual IN (0,1))');
            if (in_array('teilnahme_profil', columns($pdo, 'anmeldung'), true)) {
                $pdo->exec("UPDATE anmeldung SET
                    teilnahme_mint      = CASE teilnahme_profil WHEN 'MINT' THEN 1 ELSE 0 END,
                    teilnahme_bilingual = CASE teilnahme_profil WHEN 'Bilingual' THEN 1 ELSE 0 END
                    WHERE teilnahme_profil IS NOT NULL");
            }
        }
        if ($version < 5) {
            $pdo->exec('ALTER TABLE anmeldung ADD COLUMN kenntnis_elterninfo_messenger INTEGER CHECK (kenntnis_elterninfo_messenger IN (0,1))');
        }
        if ($version < 6) {
            $pdo->exec("ALTER TABLE anmeldung ADD COLUMN geschlecht TEXT CHECK (geschlecht IN ('m','w','d','x'))");
        }
        // Spätere Migrationen hier anhängen: if ($version < 7) { ... }
    }
    $pdo->exec('PRAGMA user_version = ' . SCHEMA_VERSION);
}

/** Spaltennamen einer Tabelle (dient als Whitelist für Eingaben). */
function columns(PDO $pdo, string $table): array
{
    static $cache = [];
    if (!isset($cache[$table])) {
        $stmt = $pdo->query('PRAGMA table_info(' . $pdo->quote($table) . ')');
        $cache[$table] = array_column($stmt->fetchAll(), 'name');
    }
    return $cache[$table];
}

/** INSERT mit gefilterten Spalten; gibt die neue ID zurück. */
function insert(PDO $pdo, string $table, array $data, array $exclude = ['id']): int
{
    $allowed = array_diff(columns($pdo, $table), $exclude);
    $data    = array_intersect_key($data, array_flip($allowed));
    if (!$data) {
        throw new ApiError(422, "Keine gültigen Felder für $table");
    }
    $cols = array_keys($data);
    $sql  = sprintf(
        'INSERT INTO %s (%s) VALUES (%s)',
        $table,
        implode(', ', $cols),
        implode(', ', array_map(fn($c) => ':' . $c, $cols))
    );
    $pdo->prepare($sql)->execute(array_map(fn($v) => is_bool($v) ? (int) $v : $v, $data));
    return (int) $pdo->lastInsertId();
}

final class ApiError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $details = [])
    {
        parent::__construct($message);
    }
}
