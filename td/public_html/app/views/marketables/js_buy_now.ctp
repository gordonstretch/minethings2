<? 
print json_encode(array('message' => $message, 'price' => $market->commatize($price), 'owned' => $owned, 'gold' => $gold));
