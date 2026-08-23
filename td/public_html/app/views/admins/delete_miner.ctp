<h1> Registered Miners </h1>
<? 
foreach ($miners as $miner) {
	print $html->link( $miner['Miner']['name'], "/miners/profile/".$miner['Miner']['name'] );
	print "---".$html->link( 'delete', '/admins/delete_miner/'.$miner['Miner']['id'], false, "Delete?" );
	print "<br>";
	}
?>