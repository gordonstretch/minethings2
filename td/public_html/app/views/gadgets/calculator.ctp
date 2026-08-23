<div id="fullcenter">

<H2><? echo $displayName; ?></H2>
<?
foreach($categories as $c)
{
	echo "<h3>".$c['categoryName']."</h3>";
	echo "<table>";
	echo $html->tableHeaders(array('Description', 'Value'));
	foreach($c['stats'] as $s)
	{
		echo $html->tableCells(array($s[0], $s[1]));
	}
	echo "</table>";
}
?>

</div>