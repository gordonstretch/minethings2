<? echo json_encode(array(
	'success' => $success,
	'oiledTrips' => $oiledTrips,
	'tripsStolen' => $tripsStolen,
	'hasOil' => $hasOil,
	'message' => isset($error) ? $error : '',
	));
