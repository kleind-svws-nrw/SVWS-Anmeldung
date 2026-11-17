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
 *   DELETE anmeldung&id=…       Verwaltung   löschen (inkl. Unterdaten)
 *
 * Verwaltung: Header "X-Admin-Key: <admin_key aus lib/config.local.php>"
 */
declare(strict_types=1);

require __DIR__ . '/lib/db.php';
$config = require __DIR__ . '/lib/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// Felder, die Eltern nicht selbst setzen dürfen
const NUR_SEKRETARIAT = ['id', 'status', 'masernschutz_nachweis', 'bemerkung_sekretariat', 'created_at', 'updated_at'];

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
    if ($fehler) {
        throw new ApiError(422, 'Eingaben unvollständig', $fehler);
    }
    $a['anmeldedatum'] ??= date('Y-m-d');

    $pdo->beginTransaction();
    try {
        $id = insert($pdo, 'anmeldung', $a, NUR_SEKRETARIAT);

        foreach (array_slice($in['erziehungsberechtigte'] ?? [], 0, 2) as $i => $eb) {
            if (!array_filter((array) $eb, fn($v) => $v !== '' && $v !== null)) {
                continue; // leere Spalte (z. B. nur ein Elternteil angegeben)
            }
            insert($pdo, 'erziehungsberechtigter', ['anmeldung_id' => $id, 'position' => $i + 1] + $eb);
        }
        foreach (array_slice($in['notfallkontakte'] ?? [], 0, 2) as $nk) {
            if (!empty($nk['name'])) {
                insert($pdo, 'notfallkontakt', ['anmeldung_id' => $id] + $nk);
            }
        }
        foreach ($in['ganztag'] ?? [] as $gt) {
            insert($pdo, 'ganztag_wunsch', ['anmeldung_id' => $id] + $gt, []);
        }
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
    $key = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
    if ($config['admin_key'] === '' || !hash_equals($config['admin_key'], $key)) {
        throw new ApiError(401, 'Nicht berechtigt');
    }
}
