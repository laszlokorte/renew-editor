<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);


define("AUTH_TEST_EMAIL", 'test@test.de');
define("AUTH_TEST_PASSWORD", 'secret');
define("AUTH_TOKEN", 'VERY_SECRET_TOKEN');

$secure = isset($_SERVER['SERVER_PORT']) && intval($_SERVER['SERVER_PORT']) === 443;
$ownURL = ($secure?"https":"http") . '://' . $_SERVER['HTTP_HOST']. $_SERVER["PHP_SELF"];

$documents = [
	["name" => "Foo", "id" => 23],
	["name" => "Bar", "id" => 42],
];

if($_SERVER['REQUEST_METHOD'] === "OPTIONS") {
	header("HTTP/1.1 202 Accepted");
	header("Access-Control-Allow-Origin: *");
	header("Access-Control-Allow-Headers: Authorization, Content-Type");
	header("Access-Control-Request-Method: *");
} elseif($_SERVER['REQUEST_METHOD'] === "POST") {
	$body = file_get_contents("php://input");
	$body_decoded = json_decode($body);
	if($body_decoded) {
		if($body_decoded->email === AUTH_TEST_EMAIL && $body_decoded->password === AUTH_TEST_PASSWORD) {
			header("HTTP/1.1 202 Accepted");
			header("Access-Control-Allow-Origin: *");
			echo json_encode(['token' => AUTH_TOKEN]);
		} else {
			header("HTTP/1.1 405 Authentication Failed");
			header("Access-Control-Allow-Origin: *");

			echo json_encode(["message" => "Invalid email or password."]);
		}
	} else {
		header("HTTP/1.1 405 Method Not Allowed");
		header("Access-Control-Allow-Origin: *");

		echo json_encode(["messasge" => "invalid json"]);
	}
} elseif (isset($_GET['page'])) {
	if($_GET['page'] === 'documents') {
		header("HTTP/1.1 200 OK");
		header("Access-Control-Allow-Origin: *");
		echo json_encode(['documents' => $documents]);
	} elseif($_GET['page'] === 'document' && isset($_GET['id'])) {
		$doc = array_values(array_filter($documents, function($d) {
			return $d['id'] == $_GET['id'];
		}));

		if(count($doc) && isset($_SERVER['HTTP_AUTHORIZATION']) && $_SERVER['HTTP_AUTHORIZATION'] === "Bearer ".AUTH_TOKEN) {
			header("HTTP/1.1 200 OK");
			header("Access-Control-Allow-Origin: *");
			echo json_encode(['document' =>
				$doc[0]]
			);
		} else {
			header("HTTP/1.1 401 Unauthorized");
			header("Access-Control-Allow-Origin: *");

			echo json_encode(["messasge" => "not authorized"]);
		}
	} else {
		header("HTTP/1.1 404 Not Found");
		header("Access-Control-Allow-Origin: *");
		echo json_encode(["messasge" => "Page Not Found"]);
	}
} elseif($_SERVER['REQUEST_METHOD'] === "GET") {
	header("HTTP/1.1 200 Ok");
	header("Access-Control-Allow-Origin: *");
	header("Content-Type: application/json");

	echo json_encode(["routes" => [
		"auth" => [
			"method" => "POST",
			"href" => $ownURL,
		],
		"documents" => [
			"method" => "GET",
			"href" => $ownURL . '?page=documents',
		],
		"document" => [
			"method" => "GET",
			"href" => $ownURL . '?page=document&id=:id',
		],
	]]);
} else {
	header("HTTP/1.1 404 Not Found");
	header("Access-Control-Allow-Origin: *");

	echo json_encode(["messasge" => "Invalid Request"]);
}