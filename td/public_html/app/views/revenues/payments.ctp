<table>
<?
echo $html->tableHeaders(array('domain', 'cash'));
foreach($referrers as $domain => $r)
{
	echo $html->tableCells(array($domain, $r['cash']));
}
?>
</table>
<? echo "Past 7 days payout: $weekPayout <BR>"; ?>
<? echo "Total payout: $totalPayout <BR>"; ?>
<BR><BR>
<table>
<?
echo $html->tableHeaders(array('name', 'date', 'domain', 'payout', 'age'));
foreach($purchases as $p)
{
	$minerLink = $html->link($p['name'], '/miners/profile/'.$p['name']);
	echo $html->tableCells(array($minerLink, $p['date'], $p['domain'], $p['payout'], $p['age']));
}
?>
</table>