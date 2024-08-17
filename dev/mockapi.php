<?php

define("AUTH_TEST_EMAIL", 'test@test.de');
define("AUTH_TEST_PASSWORD", 'secret');
define("AUTH_TOKEN", 'VERY_SECRET_TOKEN');

$documents = [
	["name" => "Foo", "id" => 23],
	["name" => "Bar", "id" => 42],
];

if($_SERVER['REQUEST_METHOD'] === "OPTIONS") {
	header("HTTP/1.1 202 Accepted");
	header("Access-Control-Allow-Origin: *");
	header("Access-Control-Allow-Headers: Authorization, Content-Type");
	header("Access-Control-Request-Method: *");
} else if($_SERVER['REQUEST_METHOD'] === "POST") {
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
} else if (isset($_GET['page']) && $_GET['page'] === 'documents') {
	if(isset($_SERVER['HTTP_AUTHORIZATION']) && $_SERVER['HTTP_AUTHORIZATION'] === "Bearer ".AUTH_TOKEN) {
		header("HTTP/1.1 200 OK");
		header("Access-Control-Allow-Origin: *");
		echo json_encode(['documents' => $documents]);
	} else {
		header("HTTP/1.1 401 Unauthorized");
		header("Access-Control-Allow-Origin: *");

		echo json_encode(["messasge" => "not authorized"]);
	}
} else if (isset($_GET['page']) && $_GET['page'] === 'document' && isset($_GET['id'])) {

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
	header("HTTP/1.1 405 Method Not Allowed");
	header("Content-Type: application/json");
	header("Access-Control-Allow-Origin: *");
	echo json_encode(["messasge" => "Invalid Request"]);
}