<?
echo $html->link("back to things", '/mine_types/browse/'.$mineTypeId);
echo "<br>";

foreach($items as $item)
{
	print $item['name']." (".$item['count'].")";
	print $html->link('Delete', '/melds/remove_item/'.$meldId.'/'.$item['id']);
	print "<br>";
}

echo $form->create("Meld", array( 'action' => 'edit/'.$meldId) );
echo $form->input("id", array('type'=>'hidden', 'value' => $meldId ) );
echo $form->input('item_ids', array('type'=>'char', 'maxLength'=>50) );
echo $form->input('public');
echo $form->end('submit');

?>