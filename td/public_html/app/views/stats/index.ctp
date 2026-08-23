<div id="fullcenter">
<h3>Server Stats (based on active players, updated daily)</h3>
<p>Note: some stats are listed by rarity in this order: grey/yellow/green/blue/red/purple/orange</p>
<?
foreach($stats as $sectionHeading => $sectionStats)
{
	echo '<h3>'.$sectionHeading.'</h3>';
	echo '<table>';
	foreach ($sectionStats as $key => $s)
	{
		$s = $market->commatizeGoldTags($s);
		echo $html->tableCells(array($key, $s));
	}
	echo '</table>';
}
?>

</div>
