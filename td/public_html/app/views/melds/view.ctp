<div id="fullcenter">

<div style="float:right">
<? 

if ($hasBrokenMeld)
{
	echo '<div style="border:solid; margin:5px; padding:5px">';

	echo '<p>Get your things back by dismantling </p><p>your old meld in '.$previousHomeCity.'</p>';

	echo $ajax->form('js_deconstruct', 'post', array(
		'model' => 'Meld', 
		'update' => 'ItemsDiv',
		'before' => "$('DeconstructButton').disabled = true;",
		'indicator' => 'LoadingDiv',
		//'url' => array('controller' => 'melds', 'action' => 'js_deconstruct'),
		))."\n";
	echo $form->input('id', array('type' => 'hidden', 'value' => $meld['id']))."\n";
	echo $form->end(array(
		'label' => 'Dismantle',
		'id' => 'DeconstructButton'
		))."\n";
	?>
	<div id="ItemsDiv"></div>
	<?

	echo '</div>';
}

echo '<div style="padding:5px">';
echo "<h3>Owned by:</h3>";
if (count($owners) == 0)
	echo '<div>nobody</div>';
foreach ($owners as $o)
{
	$name = $html->link($o['name'].' ('.$o['meldCount'].')', '/miners/profile/'.$o['name']);
	echo '<div>'.$name.'</div>';
}
echo '</div>';

?>
</div> <!-- end right float -->

<?
if ($mineName) 
	echo $html->link($mineName, '/mine_types/browse/'.$mineTypeId).': ';
echo $meld['name'].' Meld<br>';

if (count($items)) 
{
	$links = array();
	$maxCols = 6;
	if (count($items) > $maxCols)
		$maxCols = intval(count($items)/2);


	print '<table class="things-table">';
	foreach($items as $item)
	{
		if ($item['href'])
			$link = $html->link($item['name'], $item['href']);
		else
			$link = $item['name'];
		$class = $itemList->GetRarityClass($item['rarity']);

		$links[] = array(
			sprintf('<input type="checkbox" disabled %s />%s', 
				$item['minerHasRequiredCount'] ? "checked" : "", 
				$link ),
			array(
				'class' => "item-$class", 
				'style' => 'background-image:url('.$html->base.$item['icon'].')',
				),
			);

		if (count($links) > $maxCols) // flush
		{
			print $html->tableCells(array($links));
			$links = array();
		}

	}
	print $html->tableCells(array($links));
	print "</table>";
}
else
	echo 'No items are required to make this meld.';
?>

<br>
<br>
<?
if ($hasMeld)
{
	echo "You have this meld!";
}
else if ( count($items) and $isPublic )
{
echo "This is the page where points are made.  Would you like to exchange your items for this meld?  The items must be in your home city first.  Once the meld is created, your items will be lost but you will forever own this meld.  You can store it in the Museum of Fine Things and it will be admired for generations to come.\n";

	
echo $form->create("Meld", array('action' => 'create'))."\n";
echo $form->input("id", array('type' => 'hidden', 'value' => $meld['id']) )."\n";
echo $form->end("Create Meld in ".$homeCity)."\n";


}
else
	echo 'This meld cannot be made from this page.';



?>


</div>