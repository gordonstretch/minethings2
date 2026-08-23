Average Age: <? echo $averageAge; ?>.<BR>
<table>
<?

echo $html->tableHeaders(array('created', 'name', 'findings', 'stopped', 'age'));
foreach($miners as $m)
{
	echo $html->tableCells(array(
		$m['Miner']['created'],
		$m['Miner']['name'],
		$m['findings'],
		$m['stopped'],
		$m['age'],
		));
}

?>
</table>