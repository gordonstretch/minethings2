<table>
<?
foreach($exchanges as $e)
	echo $html->tableCells(array(array(
		$html->link($e['Miner']['name'], '/miners/profile/'.$e['Miner']['name']),
		$html->link('(admin)', '/admins/view_miner/'.$e['Miner']['name']),
		$e['Exchange']['description'],
		$e['Exchange']['credits'],
		$e['Exchange']['created'],
		)));
?>
</table>
<? echo 'Total '.$total; ?>
