<?

class EquipmentHelper extends AppHelper
{
	var $helpers = array('Html');

	function EquipmentImage($imageName, $equipmentItemIds/*indexed by equipment type*/, $baseUrl)
	{
		$mapName = '#MAP';
		foreach($equipmentItemIds as $eid)
			$mapName.= "_$eid";

		$mapData = array();
		foreach($equipmentItemIds as $type => $itemId)
		{
			switch($type)
			{
				case 1: $coords = ''; break;
				case 2: $coords = ''; break;
				case 3: $coords = ''; break;
				case 4: $coords = ''; break;
				case 5: $coords = ''; break;
				case 6: $coords = ''; break;
				case 7: $coords = ''; break;
			}

			$mapData[$type] = array(
				'id' => $itemId,
				'coords' => $coords,
				);
		}

		$image = '<map NAME="'.$mapName.'">';
		foreach($mapData as $d)
			$image.= '<area SHAPE=RECT COORDS = "'.$d['coords'].'" HREF="'.$baseUrl.'/items/view/'.$d['id'].'">';
		$image.= $this->Html->image($imageName, array('alt' => 'Miner bot with equipment', 'ISMAP' => true, 'USEMAP' => $mapName));

		return $image;
	}

}

?>