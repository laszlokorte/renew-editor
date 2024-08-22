<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);


define("AUTH_TEST_EMAIL", 'test@test.de');
define("AUTH_TEST_PASSWORD", 'secret');
define("AUTH_TOKEN", 'VERY_SECRET_TOKEN');

$secure = isset($_SERVER['SERVER_PORT']) && intval($_SERVER['SERVER_PORT']) === 443;
$ownURL = ($secure?"https":"http") . '://' . $_SERVER['HTTP_HOST']. $_SERVER["PHP_SELF"];

$documents = json_decode(file_get_contents(__DIR__.'/mock_documents.json'), true) ?? [];

function is_authed() {
	return isset($_SERVER['HTTP_AUTHORIZATION']) && $_SERVER['HTTP_AUTHORIZATION'] === "Bearer ".AUTH_TOKEN;
}

if($_SERVER['REQUEST_METHOD'] === "OPTIONS") {
	header("HTTP/1.1 202 Accepted");
	header("Access-Control-Allow-Origin: *");
	header("Access-Control-Allow-Headers: Authorization, Content-Type");
	header("Access-Control-Request-Method: *");
	header("Access-Control-Allow-Methods: *");
} elseif($_SERVER['REQUEST_METHOD'] === "POST") {
	if(isset($_GET['page'])) {
		if($_GET['page'] === 'documents' && is_authed()) {
			header("HTTP/1.1 200 OK");
			header("Access-Control-Allow-Origin: *");

			$newDocument = (object)[
				'name' => sprintf("Document #%d", count($documents)),
				'id' => count($documents)*17+13,
			];

			$documents[] = $newDocument;

			file_put_contents(__DIR__.'/mock_documents.json', json_encode($documents));

			echo json_encode(['document' => $newDocument]);
		} else {
			header("HTTP/1.1 404 Not Found");
			header("Access-Control-Allow-Origin: *");
			echo json_encode(["message" => "Page Not Found"]);
		}
	}  else {
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

				echo json_encode(["message" => "Invalid E-mail or Password."]);
			}
		} else {
			header("HTTP/1.1 405 Method Not Allowed");
			header("Access-Control-Allow-Origin: *");

			echo json_encode(["message" => "invalid json"]);
		}
	}
} elseif ($_SERVER['REQUEST_METHOD'] === "GET" && isset($_GET['page'])) {
	if($_GET['page'] === 'documents' && is_authed()) {
		header("HTTP/1.1 200 OK");
		header("Access-Control-Allow-Origin: *");
		echo json_encode(['documents' => $documents]);
	} elseif($_GET['page'] === 'document' && isset($_GET['id'])) {
		$doc = array_values(array_filter($documents, function($d) {
			return $d['id'] == $_GET['id'];
		}));

		if(count($doc) && is_authed()) {
			header("HTTP/1.1 200 OK");
			header("Access-Control-Allow-Origin: *");
			echo json_encode(['document' =>
				$doc[0]]
			);
		} else {
			header("HTTP/1.1 401 Unauthorized");
			header("Access-Control-Allow-Origin: *");

			echo json_encode(["message" => "not authorized"]);
		}
	} else {
		header("HTTP/1.1 404 Not Found");
		header("Access-Control-Allow-Origin: *");
		echo json_encode(["message" => "Page Not Found"]);
	}
} elseif($_SERVER['REQUEST_METHOD'] === "GET") {
	header("HTTP/1.1a 200 Ok");
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
} elseif($_SERVER['REQUEST_METHOD'] === "DELETE") {
	if($_GET['page'] === 'document' && isset($_GET['id'])) {
		$doc = array_values(array_filter($documents, function($d) {
			return $d['id'] == $_GET['id'];
		}));

		if(count($doc) && is_authed()) {
			header("HTTP/1.1 200 OK");
			header("Access-Control-Allow-Origin: *");

			$documents = array_values(array_filter($documents, function($d) {
				return $d['id'] != $_GET['id'];
			}));

			file_put_contents(__DIR__.'/mock_documents.json', json_encode($documents));

		} else {
			header("HTTP/1.1 401 Unauthorized");
			header("Access-Control-Allow-Origin: *");

			echo json_encode(["message" => "not authorized"]);
		}
	} else {
		header("HTTP/1.1 404 Not Found");
		header("Access-Control-Allow-Origin: *");
		echo json_encode(["message" => "Page Not Found"]);
	}
} else {
	header("HTTP/1.1 404 Not Found");
	header("Access-Control-Allow-Origin: *");

	echo json_encode(["message" => "Invalid Request"]);
}