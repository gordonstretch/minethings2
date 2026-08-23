<table>
<?
echo $html->tableHeaders(array('week start', 'landings', 'landed conversions', 'ratio', 'total conversions'));
foreach($weeks as $w)
	echo $html->tableCells(array($w['weekStart'], $w['landings'], $w['landedConversions'], $w['ratio'], $w['conversions']));
?>
</table>
Total Conversions: <? echo $totalConversions; ?>
	