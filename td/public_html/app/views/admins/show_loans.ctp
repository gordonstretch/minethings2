<?
echo $html->link('fix them', '/admins/show_garnishments/1');
echo "<BR>";
echo $totalGoldCreated.' gold created<BR>';

foreach($debtors as $d)
{
	print $d['Miner']['name'].' '.$d['Miner']['gold'].'g, '.$d['totalGarnishmets'].'g in unpaid garnishments.<BR>';
	foreach($d['Garnishment'] as $l)
		print $l['amount_unpaid'].'<BR>';
	print "<BR>";
}
?>