Avg wait: <?
echo $avgWait;
?>h

<table>
<?
foreach($miners as $m)
	echo $html->tableCells(array($m['Miner']['name'], $m['wait']));
?>
</table>