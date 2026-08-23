<div id="fullcenter">

<H2><? echo $displayName; ?></H2>

<p>This shows the top-10 cheapest melds based on:</p>
<ul>
<li>All things belonging to you.*</li>
<li>Market listings in the current city.</li>
</ul>
<p>If there are not ten melds in the list, that means that there is not enough price data to put a price on ten melds.</p>
<p>*with the exception of equipment that is in use</p>

<table>
<?
echo $html->tableHeaders(array('Meld', 'price'));
foreach($melds as $m)
	echo $html->tableCells(array(
		$html->link($m['name'], '/melds/view/'.$m['id']),
		$market->commatize($m['price']).'g',
		));
?>
</table>

</div>
