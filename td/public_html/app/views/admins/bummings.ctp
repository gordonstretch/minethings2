<table>
<?
echo $html->tableHeaders(array('winner', 'loser', 'hoarder', 'items'));
foreach($logs as $l)
	echo $html->tableCells(array(array(
		$html->link($l['winner'], '/miners/profile/'.$l['winner']),
		$html->link($l['loser'], '/miners/profile/'.$l['loser']),
		$html->link($l['hoarder'], '/miners/profile/'.$l['hoarder']),
		$l['items'],
		$l['created'],
		)));

?>

</table>