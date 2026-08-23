
<div style="margin-left:50px;font-weight:bold">
<? echo $html->link($ownerName, '/miners/profile/'.$ownerName)."'s Listings and Bids in ".$cityName.":"; ?>
</div>

<table>
<tr>
<td valign=top>

<h2 id="listings">Listings</h2>
<table class="table" summary="Listings">
<tbody>
<?
$cells = array();
foreach($listings as $listing)
{
	$row = array( 
		array (
			$html->link($listing['name'], '/'.$listing['url'], array( 
				'class' => $itemList->GetRarityClass($listing['rarity']),
				'style' => 'background-image:url('.$html->base.$listing['icon'].')',
				)), 
			array('class' => 'item'),
			),
		array(
			$market->priceQuantity($listing['price'], $listing['quantity']),
			array('class' => 'price'),
			),			
		);
	if ($isOwner)
		$row[] = $ajax->link( 'cancel', '/marketables/js_cancel/'.$listing['id'], array(
			'id' => "Cancel".$listing['id'],
			'onclick' => '$("Cancel'.$listing['id'].'").up().up().hide();',
			'complete' => '
				var data = request.responseText.evalJSON();
				if (!data.success)
					$("Cancel'.$listing['id'].'").up().up().show();',
			));
	$cells[] = $row;
}
echo $html->tableCells( $cells, array('class' => 'even'), array('class' => 'odd'), false, false );
?>
</tbody>
</table>

</td>
<td valign=top>

<h2 id="bids">Bids</h2>
<table class="table" summary="Bids">
<tbody>
<?
$cells = array();
foreach($bids as $bid)
{
	$row = array( 
		array (
			$html->link($bid['name'], '/'.$bid['url'], array( 
				'class' => $itemList->GetRarityClass($bid['rarity']),
				'style' => 'background-image:url('.$html->base.$bid['icon'].')',
				)), 
			array('class' => 'item')),
		array(
			$market->priceQuantity($bid['price'], $bid['quantity']),
			array('class' => 'price')));
	if ($isOwner)
		$row[] = $ajax->link( 'cancel', '/marketables/js_cancel/'.$bid['id'], array(
			'id' => "Cancel".$bid['id'],
			'onclick' => '$("Cancel'.$bid['id'].'").up().up().hide();',
			'complete' => '
				var data = request.responseText.evalJSON();
				if (!data.success)
					$("Cancel'.$bid['id'].'").up().up().show();',
			));
	$cells[] = $row;

}
echo $html->tableCells( $cells, array('class' => 'even'), array('class' => 'odd') );
?>
</tbody>
</table>



</td>
</tr>
</table>
