<table>
<?

echo $html->tableHeaders(array('domain', 'referrals'));
foreach($referrers as $domain => $r)
{
	echo $html->tableCells(array(
		$domain,
		$r['referralCount'],
		));
}

?>
</table>

<table>
<?
echo $html->tableHeaders(array('name', 'referrer', 'created'));
foreach($miners as $m)
	echo $html->tableCells(array(
		$m['Miner']['name'],
		$m['referrer'],
		$m['Miner']['created'],
	));
?>
</table>