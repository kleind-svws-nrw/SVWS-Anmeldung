<?php
/**
 * API-Zugang für den Verwaltungsbereich.
 * Liegt im passwortgeschützten Ordner admin/ – der Webserver lässt nur angemeldete Benutzer durch
 * und übergibt deren Namen als REMOTE_USER. api.php gibt die Verwaltungsaktionen nur dann frei.
 */
declare(strict_types=1);

define('ADMIN_BEREICH', true);
require dirname(__DIR__) . '/api.php';
