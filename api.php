<?php
/**
 * API für die Online-Anmeldung.
 * Einziger Einstiegspunkt für alle Datenbankzugriffe.
 *
 * Aufruf:  api.php?action=<aktion>   (JSON rein, JSON raus)
 *
 *   GET    ping                 öffentlich   Status + DB-Check
 *   POST   anmeldung            öffentlich   neue Anmeldung speichern
 *   GET    anmeldungen          Verwaltung   Liste (Filter: formular, status)
 *   GET    anmeldung&id=…       Verwaltung   eine Anmeldung inkl. Unterdaten
 *   PATCH  anmeldung&id=…       Verwaltung   Status/Sekretariatsfelder ändern
 *   PUT    anmeldung&id=…       Verwaltung   alle Formularangaben ersetzen (Nachbearbeitung)
 *   DELETE anmeldung&id=…       Verwaltung   löschen (inkl. Unterdaten)
 *
 * Verwaltung: über admin/api.php (Passwortschutz des Ordners admin/)
 *             oder Header "X-Admin-Key: <admin_key aus lib/config.local.php>"
 */
declare(strict_types=1);

require __DIR__ . '/lib/db.php';
$config = require __DIR__ . '/lib/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// Felder, die Eltern nicht selbst setzen dürfen
const NUR_SEKRETARIAT = ['id', 'status', 'masernschutz_nachweis', 'bemerkung_sekretariat', 'created_at', 'updated_at'];
// Spalten früherer Formularfassungen: bleiben bei der Nachbearbeitung unverändert
const VERALTETE_SPALTEN = ['teilnahme_profil', 'einwilligung_digitale_kommunikation', 'kenntnis_email_webuntis'];

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? '';
    $pdo    = db($config);

    switch ("$method $action") {
        case 'GET ping':
            respond(['ok' => true, 'schema' => (int) $pdo->query('PRAGMA user_version')->fetchColumn()]);

        case 'POST anmeldung':
            respond(['ok' => true, 'id' => anmeldungAnlegen($pdo, jsonBody())], 201);

        case 'GET anmeldungen':
            requireAdmin($config);
            respond(['ok' => true, 'daten' => anmeldungenListe($pdo, $_GET)]);

        case 'GET anmeldung':
            requireAdmin($config);
            respond(['ok' => true, 'daten' => anmeldungLaden($pdo, idParam())]);

        case 'PATCH anmeldung':
            requireAdmin($config);
            anmeldungVerwalten($pdo, idParam(), jsonBody());
            respond(['ok' => true]);

        case 'PUT anmeldung':
            requireAdmin($config);
            anmeldungAktualisieren($pdo, idParam(), jsonBody());
            respond(['ok' => true]);

        case 'DELETE anmeldung':
            requireAdmin($config);
            $stmt = $pdo->prepare('DELETE FROM anmeldung WHERE id = ?');
            $stmt->execute([idParam()]);
            if ($stmt->rowCount() === 0) {
                throw new ApiError(404, 'Anmeldung nicht gefunden');
            }
            respond(['ok' => true]);

        default:
            throw new ApiError(404, 'Unbekannte Aktion');
    }
} catch (ApiError $e) {
    respond(['ok' => false, 'fehler' => $e->getMessage(), 'details' => $e->details], $e->status);
} catch (Throwable $e) {
    error_log('[anmeldung] ' . $e);
    respond(['ok' => false, 'fehler' => $config['debug'] ? $e->getMessage() : 'Interner Fehler'], 500);
}

// ---------------------------------------------------------------- Aktionen

function anmeldungAnlegen(PDO $pdo, array $in): int
{
    $a = anmeldungPruefen($in);
    $a['anmeldedatum'] ??= date('Y-m-d');

    $pdo->beginTransaction();
    try {
        $id = insert($pdo, 'anmeldung', $a, NUR_SEKRETARIAT);
        unterdatenSpeichern($pdo, $id, $in);
        $pdo->commit();
        return $id;
    } catch (Throwable $e) {
        $pdo->rollBack();
        if ($e instanceof PDOException && str_contains($e->getMessage(), 'CHECK constraint')) {
            throw new ApiError(422, 'Ungültiger Wert in den Eingaben');
        }
        throw $e;
    }
}

/**
 * Nachbearbeitung durch das Sekretariat (nur Verwaltung): ersetzt alle Formularangaben einer Anmeldung.
 * Sekretariatsfelder (Status, Masernschutz, Bemerkung) und Felder früherer Formularfassungen bleiben unverändert.
 */
function anmeldungAktualisieren(PDO $pdo, int $id, array $in): void
{
    $a = anmeldungPruefen($in);
    $spalten = array_diff(columns($pdo, 'anmeldung'), NUR_SEKRETARIAT, VERALTETE_SPALTEN);
    $werte = [];
    foreach ($spalten as $s) {
        $v = $a[$s] ?? null;
        $werte[$s] = ($v === '' ? null : $v);   // im Formular geleerte Felder werden geleert
    }
    $pdo->beginTransaction();
    try {
        $set  = implode(', ', array_map(fn($c) => "$c = :$c", array_keys($werte)));
        $stmt = $pdo->prepare("UPDATE anmeldung SET $set WHERE id = :id");
        $stmt->execute($werte + ['id' => $id]);
        if ($stmt->rowCount() === 0) {
            throw new ApiError(404, 'Anmeldung nicht gefunden');
        }
        foreach (['erziehungsberechtigter', 'notfallkontakt', 'ganztag_wunsch'] as $t) {
            $pdo->prepare("DELETE FROM $t WHERE anmeldung_id = ?")->execute([$id]);
        }
        unterdatenSpeichern($pdo, $id, $in);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        if ($e instanceof PDOException && str_contains($e->getMessage(), 'CHECK constraint')) {
            throw new ApiError(422, 'Ungültiger Wert in den Eingaben');
        }
        throw $e;
    }
}

/** Prüft die Formulardaten; liefert die Spaltenwerte für die Tabelle anmeldung (ohne Sekretariatsfelder). */
function anmeldungPruefen(array $in): array
{
    $a = $in['anmeldung'] ?? [];
    $a['formular'] = $in['formular'] ?? null;
    foreach (NUR_SEKRETARIAT as $f) {
        unset($a[$f]);
    }

    $fehler = [];
    if (!in_array($a['formular'], ['EP', 'MS'], true)) {
        $fehler['formular'] = 'EP oder MS erwartet';
    }
    foreach (['name', 'vorname', 'geburtsdatum'] as $pflicht) {
        if (trim((string) ($a[$pflicht] ?? '')) === '') {
            $fehler[$pflicht] = 'Pflichtfeld';
        }
    }
    if (!empty($a['geburtsdatum']) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $a['geburtsdatum'])) {
        $fehler['geburtsdatum'] = 'Format JJJJ-MM-TT';
    }
    $stufe = (int) ($a['jahrgangsstufe'] ?? 0);
    if ($stufe >= 7 && ($a['teilnahme_mint'] ?? '') === '' && ($a['teilnahme_bilingual'] ?? '') === '') {
        $fehler['teilnahme'] = 'Bitte MINT und/oder Bilingual oder „keine Teilnahme“ angeben';
    }
    $einschulung = trim((string) ($a['einschulungsjahr'] ?? ''));
    if ($einschulung !== '') {
        if (!preg_match('/^\d{4}$/', $einschulung)) {
            $fehler['einschulungsjahr'] = 'Vierstellige Jahreszahl erwartet, z. B. 2014';
        } elseif ((int) $einschulung < 1990 || (int) $einschulung > (int) date('Y')) {
            $fehler['einschulungsjahr'] = 'Jahr zwischen 1990 und ' . date('Y') . ' erwartet';
        }
    }
    $dienstag = array_filter($in['ganztag'] ?? [], fn($g) => ($g['tag'] ?? '') === 'Di');
    if (count($dienstag) > 1) {
        $fehler['ganztag'] = 'Dienstags ist nur ein Ganztagsangebot möglich';
    }
    if ($fehler) {
        throw new ApiError(422, 'Eingaben unvollständig', $fehler);
    }
    return $a;
}

/** Erziehungsberechtigte, Notfallkontakte und Ganztagswünsche zu einer Anmeldung speichern. */
function unterdatenSpeichern(PDO $pdo, int $id, array $in): void
{
    foreach (array_slice($in['erziehungsberechtigte'] ?? [], 0, 2) as $i => $eb) {
        if (!array_filter((array) $eb, fn($v) => $v !== '' && $v !== null)) {
            continue; // leere Spalte (z. B. nur ein Elternteil angegeben)
        }
        unset($eb['id'], $eb['anmeldung_id'], $eb['position']);
        insert($pdo, 'erziehungsberechtigter', ['anmeldung_id' => $id, 'position' => $i + 1] + $eb);
    }
    foreach (array_slice($in['notfallkontakte'] ?? [], 0, 2) as $nk) {
        if (!empty($nk['name'])) {
            unset($nk['id'], $nk['anmeldung_id']);
            insert($pdo, 'notfallkontakt', ['anmeldung_id' => $id] + $nk);
        }
    }
    foreach ($in['ganztag'] ?? [] as $gt) {
        insert($pdo, 'ganztag_wunsch', ['anmeldung_id' => $id, 'angebot' => $gt['angebot'] ?? null, 'tag' => $gt['tag'] ?? null], []);
    }
}

function anmeldungenListe(PDO $pdo, array $q): array
{
    $where = [];
    $args  = [];
    foreach (['formular', 'status', 'schuljahr'] as $f) {
        if (!empty($q[$f])) {
            $where[] = "$f = ?";
            $args[]  = $q[$f];
        }
    }
    $sql = 'SELECT id, formular, status, schuljahr, jahrgangsstufe, name, vorname, geburtsdatum, anmeldedatum
            FROM anmeldung' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') .
           ' ORDER BY name, vorname';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    return $stmt->fetchAll();
}

function anmeldungLaden(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM anmeldung WHERE id = ?');
    $stmt->execute([$id]);
    $a = $stmt->fetch() ?: throw new ApiError(404, 'Anmeldung nicht gefunden');

    foreach ([
        'erziehungsberechtigte' => 'SELECT * FROM erziehungsberechtigter WHERE anmeldung_id = ? ORDER BY position',
        'notfallkontakte'       => 'SELECT * FROM notfallkontakt WHERE anmeldung_id = ? ORDER BY id',
        'ganztag'               => 'SELECT angebot, tag FROM ganztag_wunsch WHERE anmeldung_id = ?',
    ] as $key => $sql) {
        $s = $pdo->prepare($sql);
        $s->execute([$id]);
        $a[$key] = $s->fetchAll();
    }
    return $a;
}

function anmeldungVerwalten(PDO $pdo, int $id, array $in): void
{
    $erlaubt = ['status', 'masernschutz_nachweis', 'bemerkung_sekretariat'];
    $daten   = array_intersect_key($in, array_flip($erlaubt));
    if (!$daten) {
        throw new ApiError(422, 'Erlaubte Felder: ' . implode(', ', $erlaubt));
    }
    $set  = implode(', ', array_map(fn($c) => "$c = :$c", array_keys($daten)));
    $stmt = $pdo->prepare("UPDATE anmeldung SET $set WHERE id = :id");
    $stmt->execute($daten + ['id' => $id]);
    if ($stmt->rowCount() === 0) {
        throw new ApiError(404, 'Anmeldung nicht gefunden');
    }
}

// ---------------------------------------------------------------- Hilfsfunktionen

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonBody(): array
{
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) {
        throw new ApiError(400, 'JSON-Body erwartet');
    }
    return $data;
}

function idParam(): int
{
    $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    return $id ?: throw new ApiError(400, 'Parameter id fehlt oder ungültig');
}

function requireAdmin(array $config): void
{
    // Aufruf über admin/api.php: Zugang regelt der Passwortschutz des Webservers (.htaccess bzw. nginx auth_basic).
    // Ohne vom Server bestätigten Benutzer wird abgelehnt – falls der Schutz einmal nicht greift, bleiben die Daten zu.
    if (defined('ADMIN_BEREICH')) {
        $benutzer = $_SERVER['REMOTE_USER'] ?? $_SERVER['REDIRECT_REMOTE_USER'] ?? '';
        if ($benutzer === '') {
            throw new ApiError(401, 'Der Verwaltungsbereich ist nicht durch ein Passwort geschützt – Webserver-Konfiguration prüfen (siehe README)');
        }
        return;
    }
    $key = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
    if ($config['admin_key'] === '' || !hash_equals($config['admin_key'], $key)) {
        throw new ApiError(401, 'Nicht berechtigt');
    }
}
