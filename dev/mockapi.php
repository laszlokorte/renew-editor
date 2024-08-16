<?php

define("AUTH_TEST_EMAIL", 'test@test.de');
define("AUTH_TEST_PASSWORD", 'secret');

if($_SERVER['REQUEST_METHOD'] === "OPTIONS") {
	header("HTTP/1.1 202 Accepted");
	header("Access-Control-Allow-Origin: *");
	header("Access-Control-Allow-Headers: *");
	header("Access-Control-Request-Method: *");
} else if($_SERVER['REQUEST_METHOD'] === "POST") {
	$body = file_get_contents("php://input");
	$body_decoded = json_decode($body);
	if($body_decoded) {
		if($body_decoded->email === AUTH_TEST_EMAIL && $body_decoded->password === AUTH_TEST_PASSWORD) {
			header("HTTP/1.1 202 Accepted");
			header("Access-Control-Allow-Origin: *");
			echo json_encode(['token' => "VERY_SECRET_TOKEN"]);
		} else {
			header("HTTP/1.1 405 Authentication Failed");
			header("Access-Control-Allow-Origin: *");

			echo json_encode(['error' => ["message" => "Invalid email or password."]]);
		}
	} else {
		header("HTTP/1.1 405 Method Not Allowed");
		header("Access-Control-Allow-Origin: *");

		echo json_encode(['error' => ["messasge" => "invalid json"]]);
	}
} else {
	header("HTTP/1.1 405 Method Not Allowed");
	header("Content-Type: application/json");
	header("Access-Control-Allow-Origin: *");

	echo json_encode(['error' => ["messasge" => "invalid json"]]);

}