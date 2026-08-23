<table>
<?

echo $html->tableHeaders(array('Owner', 'Op', 'City', 'Built', 'Action', 'Estimate'));
foreach ($factories as $f)
	echo $html->tableCells(array(array(
		$html->link($f['owner'], '/miners/profile/'.$f['owner']),
		$html->link($f['miner'], '/miners/profile/'.$f['miner']),
		$f['city'],
		$f['built'],
		$f['action'],
		$f['estimate'] ? $time->timeago($f['estimate']) : 'NA',
		)));

?>

</table>